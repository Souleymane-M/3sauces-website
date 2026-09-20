import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { normaliserTelephone } from "@/lib/telephone";
import {
  construireHeureSouhaiteeUtc,
  creneauDansPlage,
  dateIsoValide,
  dateMayotteIso,
  prochainesDatesOuvertes,
} from "@/lib/commande-publique/creneau";
import { limiterDebit } from "@/lib/auth/rate-limit";
import type {
  CanalPublic,
  CreerCommandePubliquePayload,
  LigneCommandePubliquePayload,
} from "@/lib/commande-publique/types";
import { NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE } from "@/lib/commande-publique/types";
import type { LigneCommande } from "@/lib/caisse/types";
import { compterPlatsGroupes, SEUIL_COMMANDE_PRIORITAIRE, SEUIL_MINIMUM_PLAT, totauxParPlat } from "@/lib/plats";
import { combinaisonAccompagnementsValide } from "@/lib/commande-publique/accompagnements";
import { MONTANT_RECOMPENSE } from "@/lib/fidelite/regles";
import { verifierTokenFidelite } from "@/lib/fidelite/session";
import { MONTANT_REMISE_LANCEMENT, SEUIL_REMISE_LANCEMENT, remiseLancementActive } from "@/lib/commande-publique/remise-lancement";

const CANAUX_PUBLICS = ["sur_place", "emporter", "livraison"] as const;
const MODES_PAIEMENT_PUBLICS = ["especes", "cb", "stripe"] as const;

// Anti-spam : cette route est publique, sans authentification. Limite large
// (pas un login) pour ne pas gêner un client qui corrige une erreur de
// formulaire, mais bloque un script qui inonderait la table `commandes`.
const MAX_COMMANDES_PAR_FENETRE = 10;
const FENETRE_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// Anti-abus sur le contenu du panier : un panier "normal" ne dépasse jamais
// ça ; au-delà, ça ne peut venir que d'une requête trafiquée.
const MAX_LIGNES_PAR_COMMANDE = 30;
const MAX_QUANTITE_PAR_LIGNE = 20;

/**
 * Création d'une commande depuis le site public (client anonyme, sans
 * authentification — cf. cahier des charges MVP du 2026-09-01).
 *
 * Sécurité : on ne fait JAMAIS confiance à ce qu'envoie le navigateur pour
 * les prix, la validité de la zone ou du créneau — tout est recalculé /
 * revérifié ici à partir de la base. `paiement_statut` reste toujours
 * "non_paye" à l'insertion, y compris pour `mode_paiement: "stripe"` : le
 * paiement en ligne est finalisé dans un second temps par
 * /api/commande/paiement (création de la session Stripe) puis confirmé de
 * façon autoritaire par /api/webhooks/stripe, jamais côté client.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  if (limiterDebit(`commande:${ip}`, MAX_COMMANDES_PAR_FENETRE, FENETRE_RATE_LIMIT_MS)) {
    return NextResponse.json(
      { error: "Trop de commandes envoyées depuis cette connexion. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as CreerCommandePubliquePayload | null;
  if (!body || !Array.isArray(body.lignes) || body.lignes.length === 0) {
    return NextResponse.json(
      { error: "Requête invalide : au moins une ligne de commande est requise." },
      { status: 400 }
    );
  }
  if (body.lignes.length > MAX_LIGNES_PAR_COMMANDE) {
    return NextResponse.json({ error: "Panier trop volumineux." }, { status: 400 });
  }

  if (!CANAUX_PUBLICS.includes(body.canal as CanalPublic)) {
    return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
  }
  if (!MODES_PAIEMENT_PUBLICS.includes(body.modePaiement as (typeof MODES_PAIEMENT_PUBLICS)[number])) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  const nom = (body.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }

  const telephone = normaliserTelephone(body.telephone ?? "");
  if (!telephone) {
    return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });
  }

  const creneauHeure = body.creneauHeure;
  if (typeof creneauHeure !== "string" || !creneauHeure) {
    return NextResponse.json({ error: "Créneau horaire requis." }, { status: 400 });
  }

  // RGPD : consentement CGV/politique de confidentialité obligatoire avant
  // toute commande — jamais de confiance dans le seul état du bouton
  // désactivé côté client.
  if (body.consentementCgv !== true) {
    return NextResponse.json(
      { error: "Tu dois accepter les CGV et la politique de confidentialité." },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();

  // --- Paramètres de livraison (source de vérité : jamais codés en dur) ---
  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] =
    await Promise.all([
      supabase
        .from("parametres_livraison")
        .select(
          "heure_debut, heure_fin, minimum_commande, site_ouvert, jours_fermeture, remise_lancement_debut, remise_lancement_fin"
        )
        .eq("id", true)
        .single(),
      supabase.from("zones_livraison").select("commune").eq("actif", true),
    ]);

  if (erreurParametres || !parametres) {
    return NextResponse.json({ error: "Erreur serveur (paramètres livraison)." }, { status: 500 });
  }
  if (erreurZones) {
    return NextResponse.json({ error: "Erreur serveur (zones livraison)." }, { status: 500 });
  }

  // Site en pause : rejet strict serveur, jamais une simple restriction
  // visuelle côté client.
  if (!parametres.site_ouvert) {
    return NextResponse.json({ error: "Le site est actuellement fermé aux commandes." }, { status: 403 });
  }

  const communesActives = new Set((zones ?? []).map((z) => z.commune));

  // --- Date de retrait (commandes à l'avance) ---
  // Les jours de fermeture hebdomadaire ne bloquent JAMAIS l'accès au site
  // (contrairement à site_ouvert, juste au-dessus) : ils restreignent
  // seulement les dates de retrait proposées. Un seul contrôle couvre à la
  // fois la date passée, le jour de fermeture, la fenêtre de réservation et
  // le cas où la cuisine a déjà fermé pour aujourd'hui.
  const dateCommande = typeof body.date === "string" ? body.date : "";
  const datesOuvertes = prochainesDatesOuvertes(
    parametres.jours_fermeture,
    parametres.heure_debut,
    parametres.heure_fin
  );
  if (!dateIsoValide(dateCommande) || !datesOuvertes.includes(dateCommande)) {
    return NextResponse.json(
      { error: "Date de retrait indisponible : choisis une date parmi les prochains jours d'ouverture." },
      { status: 400 }
    );
  }

  // Commande à l'avance : personne ne peut garantir un encaissement en
  // personne à une date future — le paiement en ligne est la seule façon de
  // sécuriser la réservation. Revérifié ici, jamais seulement masqué dans
  // le sélecteur côté client.
  if (dateCommande !== dateMayotteIso() && body.modePaiement !== "stripe") {
    return NextResponse.json(
      { error: "Commande à l'avance : le paiement en ligne est requis pour confirmer votre réservation." },
      { status: 400 }
    );
  }

  // On applique la même plage horaire d'ouverture (10h30–15h00) aux deux
  // canaux : la table `parametres_livraison` est la seule source d'horaires
  // disponible en base, et rien dans le cahier des charges n'indique des
  // horaires différents pour le retrait sur place.
  if (!creneauDansPlage(creneauHeure, parametres.heure_debut, parametres.heure_fin)) {
    return NextResponse.json(
      {
        error: `Créneau invalide : choisis une heure entre ${parametres.heure_debut.slice(0, 5)} et ${parametres.heure_fin.slice(0, 5)}.`,
      },
      { status: 400 }
    );
  }

  // --- Validation des lignes / produits (jamais de confiance dans les prix envoyés) ---
  const produitIds = [...new Set(body.lignes.map((l) => l.produitId))];
  const { data: produits, error: erreurProduits } = await supabase
    .from("produits")
    .select(
      "id, nom, categorie, prix, nb_viandes_max, actif, viande_imposee, nb_sauces_incluses, nb_saveurs_max, canette_incluse, salade_incluse, accompagnement_inclus, accompagnements_disponibles"
    )
    .in("id", produitIds);

  if (erreurProduits) {
    return NextResponse.json({ error: "Erreur serveur (produits)." }, { status: 500 });
  }

  const { data: viandesActives, error: erreurViandes } = await supabase
    .from("viandes")
    .select("nom")
    .eq("actif", true);

  if (erreurViandes) {
    return NextResponse.json({ error: "Erreur serveur (viandes)." }, { status: 500 });
  }
  const nomsViandesValides = new Set((viandesActives ?? []).map((v) => v.nom));

  const { data: saucesActives, error: erreurSauces } = await supabase
    .from("sauces")
    .select("nom")
    .eq("actif", true);

  if (erreurSauces) {
    return NextResponse.json({ error: "Erreur serveur (sauces)." }, { status: 500 });
  }
  const nomsSaucesValides = new Set((saucesActives ?? []).map((s) => s.nom));

  const { data: saveursActives, error: erreurSaveurs } = await supabase
    .from("saveurs")
    .select("nom")
    .eq("actif", true);

  if (erreurSaveurs) {
    return NextResponse.json({ error: "Erreur serveur (saveurs)." }, { status: 500 });
  }
  const nomsSaveursValides = new Set((saveursActives ?? []).map((s) => s.nom));

  // Accompagnements proposables en choix gratuit inclus (Plats du jour) —
  // jamais "Salade", qui reste incluse automatiquement sans choix quand
  // elle fait partie de la recette (mécanisme distinct de celui-ci).
  const { data: accompagnementsActifs, error: erreurAccompagnements } = await supabase
    .from("produits")
    .select("nom")
    .eq("categorie", "accompagnement")
    .eq("actif", true)
    .neq("nom", "Salade");

  if (erreurAccompagnements) {
    return NextResponse.json({ error: "Erreur serveur (accompagnements)." }, { status: 500 });
  }
  const nomsAccompagnementsValides = new Set((accompagnementsActifs ?? []).map((a) => a.nom));

  const produitParId = new Map((produits ?? []).map((p) => [p.id, p]));
  const lignes: LigneCommande[] = [];

  for (const ligneBrute of body.lignes as LigneCommandePubliquePayload[]) {
    const produit = produitParId.get(ligneBrute.produitId);
    // Le site public n'affiche que des produits actifs à prix fixe (prix non
    // null) : un produit inactif ou à prix libre ici ne peut venir que d'une
    // requête trafiquée.
    if (!produit || !produit.actif || produit.prix === null) {
      return NextResponse.json(
        { error: `Produit indisponible : ${ligneBrute.produitId}` },
        { status: 400 }
      );
    }

    const quantite = Number(ligneBrute.quantite);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > MAX_QUANTITE_PAR_LIGNE) {
      return NextResponse.json({ error: `Quantité invalide pour ${produit.nom}.` }, { status: 400 });
    }

    const viandes = Array.isArray(ligneBrute.viandes) ? ligneBrute.viandes : [];
    if (viandes.length !== produit.nb_viandes_max) {
      return NextResponse.json(
        {
          error: `${produit.nom} nécessite exactement ${produit.nb_viandes_max} viande(s) sélectionnée(s).`,
        },
        { status: 400 }
      );
    }
    if (viandes.some((v) => !nomsViandesValides.has(v))) {
      return NextResponse.json({ error: `Viande invalide sur la ligne ${produit.nom}.` }, { status: 400 });
    }

    // Produit "verrouillé" (ex: Menu Collégien) : la viande envoyée doit
    // impérativement correspondre à la viande imposée en base — toute autre
    // valeur ne peut venir que d'une requête trafiquée.
    if (produit.viande_imposee && viandes[0] !== produit.viande_imposee) {
      return NextResponse.json(
        { error: `${produit.nom} est disponible uniquement en ${produit.viande_imposee}.` },
        { status: 400 }
      );
    }

    // Sauces : deux régimes distincts.
    //  - "Sauce supplémentaire" (produit dédié, +0,50€/unité) : exactement 1
    //    sauce par ligne (le client en ajoute plusieurs lignes pour plusieurs
    //    unités — cf. commande-publique-app.tsx).
    //  - Sinon, sauces incluses sans supplément : le maximum vient du produit
    //    lui-même (`nb_sauces_incluses`, en base) — 0 pour un produit qui n'en
    //    propose pas (rejet strict de toute sauce envoyée), 2 pour le Menu
    //    Collégien, 3 pour le Menu Étudiant et les Tacos/Barquette/Bowl. Ça
    //    évite de coder en dur une liste de catégories : chaque produit porte
    //    sa propre règle.
    // Doublons autorisés pour les sauces incluses (ex: "double mayo"), même
    // mécanique que les viandes — jamais rejetés comme "en double".
    const sauces = Array.isArray(ligneBrute.sauces) ? ligneBrute.sauces : [];
    const estSauceSupplementaire = produit.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE;
    if (estSauceSupplementaire) {
      if (sauces.length !== 1) {
        return NextResponse.json(
          { error: "Sélectionne exactement une sauce supplémentaire." },
          { status: 400 }
        );
      }
    } else {
      const maxSaucesIncluses = produit.nb_sauces_incluses ?? 0;
      if (sauces.length > maxSaucesIncluses) {
        return NextResponse.json(
          {
            error:
              maxSaucesIncluses === 0
                ? `Sauces non disponibles sur ${produit.nom}.`
                : `Maximum ${maxSaucesIncluses} sauces sur ${produit.nom}.`,
          },
          { status: 400 }
        );
      }
      // Choix d'au moins 1 sauce obligatoire dès que le produit en propose
      // (Tacos/Barquette/Bowl/Menu Étudiant/Menu Collégien) — jamais une
      // commande sans sauce précisée pour la cuisine.
      if (maxSaucesIncluses > 0 && sauces.length === 0) {
        return NextResponse.json({ error: `Choisis au moins 1 sauce sur ${produit.nom}.` }, { status: 400 });
      }
    }
    if (sauces.some((s) => !nomsSaucesValides.has(s))) {
      return NextResponse.json({ error: `Sauce invalide sur la ligne ${produit.nom}.` }, { status: 400 });
    }

    // Saveur (site public uniquement, ex: Canette 33cl) : même régime que les
    // viandes, un choix exact et obligatoire dès que `nb_saveurs_max > 0`.
    const saveurs = Array.isArray(ligneBrute.saveurs) ? ligneBrute.saveurs : [];
    if (saveurs.length !== produit.nb_saveurs_max) {
      return NextResponse.json(
        {
          error:
            produit.nb_saveurs_max === 0
              ? `Pas de choix de saveur sur ${produit.nom}.`
              : `${produit.nom} nécessite exactement ${produit.nb_saveurs_max} saveur(s) sélectionnée(s).`,
        },
        { status: 400 }
      );
    }
    if (saveurs.some((s) => !nomsSaveursValides.has(s))) {
      return NextResponse.json({ error: `Saveur invalide sur la ligne ${produit.nom}.` }, { status: 400 });
    }

    // Boisson incluse (Tacos/Barquette/Bowl/Menu Étudiant) : la saveur de la
    // canette comprise dans le prix, choisie dans le même configurateur que
    // la/les viande(s) et sauce(s) — jamais une ligne de panier séparée.
    // N'a de sens que si le produit inclut effectivement une canette.
    const boissonIncluse = typeof ligneBrute.boissonIncluse === "string" ? ligneBrute.boissonIncluse : null;
    if (boissonIncluse !== null) {
      if (!produit.canette_incluse) {
        return NextResponse.json({ error: `Pas de canette incluse sur ${produit.nom}.` }, { status: 400 });
      }
      if (!nomsSaveursValides.has(boissonIncluse)) {
        return NextResponse.json(
          { error: `Saveur de canette invalide sur la ligne ${produit.nom}.` },
          { status: 400 }
        );
      }
    }

    // Salade incluse (Barquettes) : choix obligatoire, gratuit — le client
    // doit trancher explicitement, jamais de valeur par défaut silencieuse.
    // La salade en option payante (Tacos/Bowl) n'a pas besoin de champ ici :
    // c'est un produit "Salade supplémentaire" comme un autre, poussé en
    // ligne de panier séparée, déjà couvert par cette même boucle.
    let saladeIncluse: boolean | null = null;
    if (produit.salade_incluse) {
      if (typeof ligneBrute.saladeIncluse !== "boolean") {
        return NextResponse.json({ error: `Choix salade requis sur ${produit.nom}.` }, { status: 400 });
      }
      saladeIncluse = ligneBrute.saladeIncluse;
    } else if (ligneBrute.saladeIncluse !== undefined && ligneBrute.saladeIncluse !== null) {
      return NextResponse.json({ error: `Salade non proposée sur ${produit.nom}.` }, { status: 400 });
    }

    // Accompagnement(s) inclus (Plats du jour) : choix obligatoire, gratuit,
    // parmi les accompagnements actifs ET disponibles aujourd'hui pour ce
    // produit précis — jamais "Salade", qui reste incluse automatiquement
    // sans choix. Groupes de combinaison (jusqu'à 2 combinables, jamais
    // mélangés avec un exclusif) revérifiés ici, jamais confiance dans la
    // seule validation client.
    let accompagnementsInclus: string[] = [];
    if (produit.accompagnement_inclus) {
      const brut = Array.isArray(ligneBrute.accompagnementsInclus) ? ligneBrute.accompagnementsInclus : null;
      if (!brut || !combinaisonAccompagnementsValide(brut)) {
        return NextResponse.json({ error: `Choix d'accompagnement invalide sur ${produit.nom}.` }, { status: 400 });
      }
      const disponibles = new Set(produit.accompagnements_disponibles ?? []);
      if (brut.some((n) => !nomsAccompagnementsValides.has(n) || !disponibles.has(n))) {
        return NextResponse.json(
          { error: `Accompagnement non disponible sur ${produit.nom}.` },
          { status: 400 }
        );
      }
      accompagnementsInclus = brut;
    } else if (
      ligneBrute.accompagnementsInclus !== undefined &&
      Array.isArray(ligneBrute.accompagnementsInclus) &&
      ligneBrute.accompagnementsInclus.length > 0
    ) {
      return NextResponse.json({ error: `Accompagnement non proposé sur ${produit.nom}.` }, { status: 400 });
    }

    // Nom optionnel du convive ("Pour Rachid") — simple étiquette
    // d'affichage, aucune validation métier au-delà d'une longueur
    // raisonnable et du nettoyage des espaces.
    const pourQuiBrut = typeof ligneBrute.pourQui === "string" ? ligneBrute.pourQui.trim() : "";
    const pourQui = pourQuiBrut ? pourQuiBrut.slice(0, 60) : null;

    // Index du plat-conteneur (mode "Commande groupée") — donnée purement
    // déclarative du client, aucune validation métier au-delà du type :
    // le regroupement n'est jamais déduit du contenu de la ligne.
    const platIndex = typeof ligneBrute.platIndex === "number" ? ligneBrute.platIndex : null;

    lignes.push({
      produitId: produit.id,
      nom: produit.nom,
      categorie: produit.categorie,
      quantite,
      prixUnitaire: produit.prix,
      coutMatiereUnitaire: null, // donnée interne, jamais calculée pour une commande publique
      viandes,
      sauces,
      saveurs,
      boissonIncluse,
      canetteIncluse: produit.canette_incluse,
      saladeIncluse,
      accompagnementsInclus,
      pourQui,
      platIndex,
    });
  }

  const montant = Math.round(lignes.reduce((t, l) => t + l.prixUnitaire * l.quantite, 0) * 100) / 100;
  // Jamais de confiance dans un nombre de plats envoyé par le client :
  // recalculé ici à partir des `platIndex` déjà validés (type uniquement,
  // c'est le regroupement lui-même qui est déclaratif).
  const nbPlats = compterPlatsGroupes(lignes);
  const modeGroupe = lignes.some((l) => l.platIndex !== null);
  if (modeGroupe && nbPlats < SEUIL_COMMANDE_PRIORITAIRE) {
    return NextResponse.json(
      { error: "Une commande groupée doit contenir au moins 3 plats." },
      { status: 400 }
    );
  }
  if (modeGroupe && [...totauxParPlat(lignes).values()].some((t) => t < SEUIL_MINIMUM_PLAT)) {
    return NextResponse.json(
      { error: "Chaque plat doit atteindre au moins 5€ pour être validé." },
      { status: 400 }
    );
  }

  // --- Règles spécifiques à la livraison ---
  let adresse: string | null = null;
  let zone: string | null = null;

  if (body.canal === "livraison") {
    adresse = (body.adresse ?? "").trim();
    zone = (body.zone ?? "").trim();

    if (!adresse) {
      return NextResponse.json({ error: "Adresse de livraison requise." }, { status: 400 });
    }
    if (!zone || !communesActives.has(zone)) {
      return NextResponse.json(
        { error: "Livraison indisponible pour cette zone. Choisis le retrait sur place." },
        { status: 400 }
      );
    }
    if (montant < parametres.minimum_commande) {
      return NextResponse.json(
        {
          error: `Minimum de commande pour la livraison : ${parametres.minimum_commande.toFixed(2)} €. Choisis le retrait sur place en dessous de ce montant.`,
        },
        { status: 400 }
      );
    }
  }

  const heureSouhaitee = construireHeureSouhaiteeUtc(creneauHeure, dateCommande);
  if (!heureSouhaitee) {
    return NextResponse.json({ error: "Créneau horaire invalide." }, { status: 400 });
  }

  // --- Récompense fidélité (site public uniquement) ---
  // Le solde affiché au client a pu changer entre-temps (passage en caisse,
  // double onglet) : tout est revérifié ici, jamais de confiance dans le
  // seul état affiché côté client.
  let recompenseAppliquee = false;
  let montantFinal = montant;
  if (body.utiliserRecompense === true) {
    const fideliteToken = typeof body.fideliteToken === "string" ? body.fideliteToken : null;
    const session = fideliteToken ? await verifierTokenFidelite(fideliteToken) : null;
    if (!session) {
      return NextResponse.json(
        { error: "Vérification du numéro expirée. Revérifie ton numéro pour utiliser ta récompense." },
        { status: 401 }
      );
    }
    if (session.telephone !== telephone) {
      return NextResponse.json(
        { error: "Le numéro de fidélité doit être le même que celui de la commande." },
        { status: 400 }
      );
    }
    if (montant < MONTANT_RECOMPENSE) {
      return NextResponse.json(
        { error: "Ta récompense s'utilise sur une commande d'au moins 10€." },
        { status: 400 }
      );
    }

    const { data: client, error: erreurClient } = await supabase
      .from("clients")
      .select("recompense_disponible")
      .eq("telephone", telephone)
      .maybeSingle();
    if (erreurClient) {
      console.error("[/api/commande] échec lecture client fidélité :", erreurClient.message);
      return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
    }
    if (!client?.recompense_disponible) {
      return NextResponse.json({ error: "Cette récompense n'est plus disponible." }, { status: 409 });
    }

    // Empêche deux onglets/tentatives de consommer la même récompense deux
    // fois : le trigger de fidélité ne se déclenche qu'au paiement, donc
    // rien d'autre ne départage deux commandes créées coup sur coup.
    const { data: commandeEnCours } = await supabase
      .from("commandes")
      .select("id")
      .eq("client_telephone", telephone)
      .eq("recompense_appliquee", true)
      .neq("paiement_statut", "paye")
      .gt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (commandeEnCours) {
      return NextResponse.json(
        { error: "Une commande en cours utilise déjà ta récompense." },
        { status: 409 }
      );
    }

    recompenseAppliquee = true;
    montantFinal = Math.round((montant - MONTANT_RECOMPENSE) * 100) / 100;
  } else if (
    remiseLancementActive(parametres.remise_lancement_debut, parametres.remise_lancement_fin, dateMayotteIso()) &&
    montant >= SEUIL_REMISE_LANCEMENT
  ) {
    // Opération de lancement (site public uniquement, jamais en caisse) —
    // une seule remise à la fois : la récompense fidélité prime toujours
    // si le client l'utilise sur cette commande (branche ci-dessus).
    montantFinal = Math.round((montant - MONTANT_REMISE_LANCEMENT) * 100) / 100;
  }

  // --- Création du client fidélité (idempotent) ---
  // Même contrainte de timing que côté caisse : le trigger DB
  // `commandes_appliquer_fidelite` crée le client, mais seulement après
  // l'insertion (AFTER INSERT) — trop tard pour la FK `commandes.client_telephone`.
  const { error: erreurUpsertClient } = await supabase
    .from("clients")
    .upsert({ telephone }, { onConflict: "telephone", ignoreDuplicates: true });

  if (erreurUpsertClient) {
    console.error("[/api/commande] échec upsert client :", erreurUpsertClient.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .insert({
      canal: body.canal,
      contenu: lignes,
      montant: montantFinal,
      // "non_paye" à l'insertion dans tous les cas (espèces/CB payés en
      // personne plus tard, ou Stripe confirmé par le webhook) — le trigger
      // de fidélité ne se déclenche qu'au passage à "paye".
      paiement_statut: "non_paye",
      mode_paiement: body.modePaiement,
      client_telephone: telephone,
      nom_livraison: nom,
      adresse_livraison: adresse,
      zone_livraison: zone,
      heure_souhaitee: heureSouhaitee.toISOString(),
      consentement_cgv_le: new Date().toISOString(),
      nb_plats: nbPlats,
      recompense_appliquee: recompenseAppliquee,
    })
    .select("id, numero")
    .single();

  if (erreurCommande || !commande) {
    console.error("[/api/commande] échec insertion commande :", erreurCommande?.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  // QR de suivi livreur (Module 2, flash départ cuisine / flash arrivée
  // client — cf. supabase/migrations/20260830100600_livraisons.sql) : posé
  // ici pour que le ticket imprimé côté caisse ait un vrai QR, jamais un
  // jeton décoratif sans lendemain. Un échec ici ne doit jamais faire
  // échouer une commande déjà enregistrée — même philosophie que
  // l'impression, qui ne bloque jamais non plus.
  let qrCode: string | null = null;
  if (body.canal === "livraison") {
    const { data: livraison, error: erreurLivraison } = await supabase
      .from("livraisons")
      .insert({ commande_id: commande.id, heure_souhaitee: heureSouhaitee.toISOString() })
      .select("qr_code")
      .single();

    if (erreurLivraison) {
      console.error("[/api/commande] échec insertion livraison :", erreurLivraison.message);
    } else {
      qrCode = livraison.qr_code;
    }
  }

  return NextResponse.json({
    ok: true,
    commandeId: commande.id,
    numero: commande.numero,
    montantBrut: montant,
    remise: Math.round((montant - montantFinal) * 100) / 100,
    montant: montantFinal,
    creneauHeure,
    date: dateCommande,
    qrCode,
  });
}
