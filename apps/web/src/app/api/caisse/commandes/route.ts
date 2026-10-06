import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";
import { notifierPaiementConfirme, notifierCommandeRecue, notifierCommandeModifiee } from "@/lib/notifications/paiement";
import {
  NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE,
  MONTANT_REDUCTION_SANS_BOISSON,
  NOM_PRODUIT_MENU_ETUDIANT,
} from "@/lib/commande-publique/types";
import {
  construireHeureSouhaiteeUtc,
  creneauDansPlage,
  dateMayotteIso,
  heureActuelleMayotteMinutes,
} from "@/lib/commande-publique/creneau";
import type { CreerCommandePayload, LigneCommande, LigneCommandePayload, ModifierCommandePayload } from "@/lib/caisse/types";
import { compterPlatsGroupes, SEUIL_MINIMUM_GROUPE, SEUIL_MINIMUM_PLAT, totauxParPlat } from "@/lib/plats";
import { combinaisonAccompagnementsValide } from "@/lib/commande-publique/accompagnements";
import { MONTANT_RECOMPENSE } from "@/lib/fidelite/regles";
import { compterTamponsDisponibles } from "@/lib/fidelite/tampons";
import { MONTANT_REMISE_LANCEMENT, SEUIL_REMISE_LANCEMENT, remiseLancementActive } from "@/lib/commande-publique/remise-lancement";
import { NOM_PRODUIT_BOISSON_OFFERTE, palierGroupeActif, type PalierGroupe } from "@/lib/commande-publique/groupe-priorite";

const CANAUX_CAISSE = ["sur_place", "emporter", "livraison"] as const;
const MODES_PAIEMENT_CAISSE = ["especes", "cb", "mixte"] as const;
const TOLERANCE_ARRONDI_PAIEMENT = 0.01;

/**
 * "Mixte" n'est jamais une valeur de `paiements.mode` (toujours especes/cb
 * individuellement) — seulement de `commandes.mode_paiement`. Revérifie que
 * chaque part est positive, d'un mode réel, et que leur somme correspond
 * exactement au montant dû (± arrondi) : jamais confiance dans le total
 * calculé côté client.
 */
function validerPaiementsMixte(
  paiementsBruts: unknown,
  montantAttendu: number
): { mode: "especes" | "cb"; montant: number }[] | null {
  if (!Array.isArray(paiementsBruts) || paiementsBruts.length === 0) return null;
  const paiements: { mode: "especes" | "cb"; montant: number }[] = [];
  for (const p of paiementsBruts) {
    const mode = (p as { mode?: unknown })?.mode;
    const montant = Number((p as { montant?: unknown })?.montant);
    if ((mode !== "especes" && mode !== "cb") || !Number.isFinite(montant) || montant <= 0) {
      return null;
    }
    paiements.push({ mode, montant: Math.round(montant * 100) / 100 });
  }
  const somme = Math.round(paiements.reduce((t, p) => t + p.montant, 0) * 100) / 100;
  if (Math.abs(somme - Math.round(montantAttendu * 100) / 100) > TOLERANCE_ARRONDI_PAIEMENT) {
    return null;
  }
  return paiements;
}

// Même plafonds anti-abus que le site public (cf. /api/commande) — un
// panier caisse "normal" ne les dépasse jamais.
const MAX_LIGNES_PAR_COMMANDE = 30;
const MAX_QUANTITE_PAR_LIGNE = 20;

/** Levée par `validerLignesCommande` pour toute erreur imputable au client (400) — jamais une erreur serveur. */
class ErreurValidation extends Error {}

interface LignesValidees {
  lignes: LigneCommande[];
  montantBrut: number;
  nbPlats: number;
  palierGroupe: PalierGroupe;
  coutMatiereTotal: number;
  coutIncomplet: boolean;
  produitParId: Map<string, { id: string; stock_jour: number | null }>;
}

/**
 * Cœur de validation partagé entre la création (POST) et la modification
 * (PATCH) d'une commande caisse : reconstruit et revalide chaque ligne à
 * partir de la carte en base (jamais de confiance dans ce qu'envoie le
 * navigateur), calcule le montant brut, le nombre de plats et le palier
 * "commande groupée" (boisson 2L offerte). Lève `ErreurValidation` pour
 * toute erreur imputable au client — jamais un throw générique, pour que
 * l'appelant puisse toujours répondre 400 avec un message clair.
 */
async function validerLignesCommande(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  lignesBrutes: unknown,
  boissonOfferteSaveurBrut: unknown
): Promise<LignesValidees> {
  if (!Array.isArray(lignesBrutes) || lignesBrutes.length === 0) {
    throw new ErreurValidation("Requête invalide : au moins une ligne de commande est requise.");
  }
  if (lignesBrutes.length > MAX_LIGNES_PAR_COMMANDE) {
    throw new ErreurValidation("Panier trop volumineux.");
  }

  const produitIds = [...new Set((lignesBrutes as LigneCommandePayload[]).map((l) => l.produitId))];
  const { data: produits, error: erreurProduits } = await supabase
    .from("produits")
    .select(
      "id, nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, viande_imposee, nb_sauces_incluses, nb_saveurs_max, actif, salade_incluse, accompagnement_inclus, stock_jour"
    )
    .in("id", produitIds);
  if (erreurProduits) {
    throw new Error("Erreur serveur (produits).");
  }

  const { data: viandesActives, error: erreurViandes } = await supabase.from("viandes").select("nom").eq("actif", true);
  if (erreurViandes) throw new Error("Erreur serveur (viandes).");
  const nomsViandesValides = new Set((viandesActives ?? []).map((v) => v.nom));

  const { data: saucesActives, error: erreurSauces } = await supabase.from("sauces").select("nom").eq("actif", true);
  if (erreurSauces) throw new Error("Erreur serveur (sauces).");
  const nomsSaucesValides = new Set((saucesActives ?? []).map((s) => s.nom));

  const { data: saveursActives, error: erreurSaveurs } = await supabase.from("saveurs").select("nom").eq("actif", true);
  if (erreurSaveurs) throw new Error("Erreur serveur (saveurs).");
  const nomsSaveursValides = new Set((saveursActives ?? []).map((s) => s.nom));

  // Parfums Boisson 2L : référentiel indépendant de `saveurs` (canettes),
  // uniquement pour ce produit (cf. NOM_PRODUIT_BOISSON_OFFERTE).
  const { data: parfums2lActifs, error: erreurParfums2l } = await supabase.from("parfums_2l").select("nom").eq("actif", true);
  if (erreurParfums2l) throw new Error("Erreur serveur (parfums Boisson 2L).");
  const nomsParfums2lValides = new Set((parfums2lActifs ?? []).map((s) => s.nom));

  // Accompagnements proposables en choix gratuit inclus (Plats du jour) —
  // jamais "Salade", incluse automatiquement sans choix (mécanisme distinct).
  const { data: accompagnementsActifs, error: erreurAccompagnements } = await supabase
    .from("produits")
    .select("nom")
    .eq("categorie", "accompagnement")
    .eq("actif", true)
    .neq("nom", "Salade");
  if (erreurAccompagnements) throw new Error("Erreur serveur (accompagnements).");
  const nomsAccompagnementsValides = new Set((accompagnementsActifs ?? []).map((a) => a.nom));

  const produitParId = new Map((produits ?? []).map((p) => [p.id, p]));
  const lignes: LigneCommande[] = [];

  for (const ligneBrute of lignesBrutes as LigneCommandePayload[]) {
    const produit = produitParId.get(ligneBrute.produitId);
    if (!produit || !produit.actif) {
      throw new ErreurValidation(`Produit introuvable ou inactif : ${ligneBrute.produitId}`);
    }

    const quantite = Number(ligneBrute.quantite);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > MAX_QUANTITE_PAR_LIGNE) {
      throw new ErreurValidation(`Quantité invalide pour ${produit.nom}.`);
    }

    // Pré-check informatif (stock du jour, ex: plats du jour) — le vrai
    // garde-fou contre la concurrence est le décrément atomique juste avant
    // l'insertion/mise à jour de la commande (cf. plus bas).
    if (produit.stock_jour !== null && quantite > produit.stock_jour) {
      throw new ErreurValidation(`Il ne reste que ${produit.stock_jour} ${produit.nom} disponible(s) aujourd'hui.`);
    }

    const viandes = Array.isArray(ligneBrute.viandes) ? ligneBrute.viandes : [];
    if (viandes.length !== produit.nb_viandes_max) {
      throw new ErreurValidation(`${produit.nom} nécessite exactement ${produit.nb_viandes_max} viande(s) sélectionnée(s).`);
    }
    if (viandes.some((v) => !nomsViandesValides.has(v))) {
      throw new ErreurValidation(`Viande invalide sur la ligne ${produit.nom}.`);
    }

    // Produit "verrouillé" (ex: Menu Collégien) : la viande envoyée doit
    // correspondre à la viande imposée en base.
    if (produit.viande_imposee && viandes[0] !== produit.viande_imposee) {
      throw new ErreurValidation(`${produit.nom} est disponible uniquement en ${produit.viande_imposee}.`);
    }

    // Sauces : même double régime que /api/commande — "Sauce supplémentaire"
    // exige exactement 1 sauce par ligne, sinon le maximum vient de
    // `nb_sauces_incluses` du produit lui-même. Doublons autorisés (ex:
    // "double mayo"), même mécanique que les viandes.
    const sauces = Array.isArray(ligneBrute.sauces) ? ligneBrute.sauces : [];
    const estSauceSupplementaire = produit.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE;
    if (estSauceSupplementaire) {
      if (sauces.length !== 1) {
        throw new ErreurValidation("Sélectionne exactement une sauce supplémentaire.");
      }
    } else {
      const maxSaucesIncluses = produit.nb_sauces_incluses ?? 0;
      if (sauces.length > maxSaucesIncluses) {
        throw new ErreurValidation(
          maxSaucesIncluses === 0 ? `Sauces non disponibles sur ${produit.nom}.` : `Maximum ${maxSaucesIncluses} sauces sur ${produit.nom}.`
        );
      }
      if (maxSaucesIncluses > 0 && sauces.length === 0) {
        throw new ErreurValidation(`Choisis au moins 1 sauce sur ${produit.nom}.`);
      }
    }
    if (sauces.some((s) => !nomsSaucesValides.has(s))) {
      throw new ErreurValidation(`Sauce invalide sur la ligne ${produit.nom}.`);
    }

    // Saveur (produit vendu directement à la saveur, ex: Canette 33cl) : un
    // choix exact et obligatoire dès que `nb_saveurs_max > 0`.
    const saveurs = Array.isArray(ligneBrute.saveurs) ? ligneBrute.saveurs : [];
    if (saveurs.length !== produit.nb_saveurs_max) {
      throw new ErreurValidation(
        produit.nb_saveurs_max === 0
          ? `Pas de choix de saveur sur ${produit.nom}.`
          : `${produit.nom} nécessite exactement ${produit.nb_saveurs_max} saveur(s) sélectionnée(s).`
      );
    }
    // La Boisson 2L a son propre référentiel de parfums, indépendant de
    // `saveurs` (canettes) — cf. lib/patron/options.ts.
    const listeSaveursValides = produit.nom === NOM_PRODUIT_BOISSON_OFFERTE ? nomsParfums2lValides : nomsSaveursValides;
    if (saveurs.some((s) => !listeSaveursValides.has(s))) {
      throw new ErreurValidation(`Saveur invalide sur la ligne ${produit.nom}.`);
    }

    // Boisson incluse (Tacos/Barquette/Bowl/Menu Étudiant) : n'a de sens que
    // si le produit inclut effectivement une canette.
    const boissonIncluse = typeof ligneBrute.boissonIncluse === "string" ? ligneBrute.boissonIncluse : null;
    if (boissonIncluse !== null) {
      if (!produit.canette_incluse) {
        throw new ErreurValidation(`Pas de canette incluse sur ${produit.nom}.`);
      }
      if (!nomsSaveursValides.has(boissonIncluse)) {
        throw new ErreurValidation(`Saveur de canette invalide sur la ligne ${produit.nom}.`);
      }
    }

    // Sans boisson (-1,50€) : le client refuse explicitement la canette
    // incluse de cette formule — jamais déduit de `boissonIncluse === null`.
    const sansBoisson = ligneBrute.sansBoisson === true;
    if (sansBoisson) {
      if (!produit.canette_incluse) {
        throw new ErreurValidation(`Pas de canette incluse sur ${produit.nom}, rien à retirer.`);
      }
      if (produit.nom === NOM_PRODUIT_MENU_ETUDIANT) {
        throw new ErreurValidation(`"Sans boisson" n'est pas proposé sur ${produit.nom}.`);
      }
      if (boissonIncluse !== null) {
        throw new ErreurValidation(`Choix incohérent (saveur + sans boisson) sur ${produit.nom}.`);
      }
    }

    // Différence caisse : un produit à prix libre (ex: "Plat du jour") est
    // autorisé ici (jamais côté public), avec un prix du jour saisi par
    // l'employé plutôt qu'un rejet.
    let prixUnitaire = produit.prix;
    if (prixUnitaire === null) {
      const prixSaisi = Number(ligneBrute.prixSaisi);
      if (!Number.isFinite(prixSaisi) || prixSaisi <= 0) {
        throw new ErreurValidation(`${produit.nom} est à prix libre : indique un prix du jour.`);
      }
      prixUnitaire = prixSaisi;
    }
    // La canette n'est plus incluse dans le prix de base des formules
    // (Tacos/Barquette/Bowl) — elle se rajoute en option, jamais l'inverse.
    // Le Menu Étudiant fait exception : sa boisson est incluse
    // obligatoirement dans son prix de base, jamais de supplément.
    if (produit.canette_incluse && produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && !sansBoisson) {
      prixUnitaire = Math.round((prixUnitaire + MONTANT_REDUCTION_SANS_BOISSON) * 100) / 100;
    }

    // Salade incluse (Barquettes) : choix obligatoire, gratuit — même règle
    // qu'au site public. La salade en option payante (Tacos/Bowl) est un
    // produit "Salade supplémentaire" comme un autre, pas de champ dédié ici.
    let saladeIncluse: boolean | null = null;
    if (produit.salade_incluse) {
      if (typeof ligneBrute.saladeIncluse !== "boolean") {
        throw new ErreurValidation(`Choix salade requis sur ${produit.nom}.`);
      }
      saladeIncluse = ligneBrute.saladeIncluse;
    } else if (ligneBrute.saladeIncluse !== undefined && ligneBrute.saladeIncluse !== null) {
      throw new ErreurValidation(`Salade non proposée sur ${produit.nom}.`);
    }

    // Accompagnement(s) inclus (Plats du jour) : choix obligatoire, gratuit,
    // parmi les accompagnements actifs ET disponibles aujourd'hui pour ce
    // produit précis — jamais "Salade", incluse automatiquement sans choix.
    // Groupes de combinaison revérifiés ici, jamais confiance dans la seule
    // validation client.
    let accompagnementsInclus: string[] = [];
    if (produit.accompagnement_inclus) {
      const brut = Array.isArray(ligneBrute.accompagnementsInclus) ? ligneBrute.accompagnementsInclus : null;
      if (!brut || !combinaisonAccompagnementsValide(brut)) {
        throw new ErreurValidation(`Choix d'accompagnement invalide sur ${produit.nom}.`);
      }
      if (brut.some((n) => !nomsAccompagnementsValides.has(n))) {
        throw new ErreurValidation(`Accompagnement non disponible sur ${produit.nom}.`);
      }
      accompagnementsInclus = brut;
    } else if (
      ligneBrute.accompagnementsInclus !== undefined &&
      Array.isArray(ligneBrute.accompagnementsInclus) &&
      ligneBrute.accompagnementsInclus.length > 0
    ) {
      throw new ErreurValidation(`Accompagnement non proposé sur ${produit.nom}.`);
    }

    const pourQuiBrut = typeof ligneBrute.pourQui === "string" ? ligneBrute.pourQui.trim() : "";
    const pourQui = pourQuiBrut ? pourQuiBrut.slice(0, 60) : null;

    // Index du plat-conteneur (mode "Commande groupée" pris au téléphone) —
    // donnée déclarative de l'employé, aucune validation métier au-delà du
    // type.
    const platIndex = typeof ligneBrute.platIndex === "number" ? ligneBrute.platIndex : null;

    lignes.push({
      produitId: produit.id,
      nom: produit.nom,
      categorie: produit.categorie,
      quantite,
      prixUnitaire,
      coutMatiereUnitaire: produit.cout_matiere,
      viandes,
      sauces,
      saveurs,
      boissonIncluse,
      sansBoisson,
      canetteIncluse: produit.canette_incluse,
      saladeIncluse,
      accompagnementsInclus,
      pourQui,
      platIndex,
    });
  }

  const montantBrut = lignes.reduce((total, l) => total + l.prixUnitaire * l.quantite, 0);
  const nbPlats = compterPlatsGroupes(lignes);
  const modeGroupe = lignes.some((l) => l.platIndex !== null);
  if (modeGroupe && nbPlats < SEUIL_MINIMUM_GROUPE) {
    throw new ErreurValidation("Une commande groupée doit contenir au moins 2 plats.");
  }
  if (modeGroupe && [...totauxParPlat(lignes).values()].some((t) => t < SEUIL_MINIMUM_PLAT)) {
    throw new ErreurValidation(`Chaque plat doit atteindre au moins ${SEUIL_MINIMUM_PLAT}€ pour être validé.`);
  }

  // Offre "commande groupée" : même règle que le site public (/api/commande)
  // — calculée une seule fois ici, sur le montant brut.
  const palierGroupe = palierGroupeActif(nbPlats, montantBrut, heureActuelleMayotteMinutes());
  if (palierGroupe === "GROUPE_4") {
    const boissonOfferteSaveur = typeof boissonOfferteSaveurBrut === "string" ? boissonOfferteSaveurBrut : null;
    if (!boissonOfferteSaveur || !nomsParfums2lValides.has(boissonOfferteSaveur)) {
      throw new ErreurValidation("Choisis un parfum disponible pour la boisson 2L offerte.");
    }

    const { data: boissonOfferte, error: erreurBoissonOfferte } = await supabase
      .from("produits")
      .select("id, nom, cout_matiere")
      .eq("nom", NOM_PRODUIT_BOISSON_OFFERTE)
      .eq("actif", true)
      .maybeSingle();
    if (erreurBoissonOfferte) throw new Error("Erreur serveur (boisson offerte).");
    if (boissonOfferte) {
      lignes.push({
        produitId: boissonOfferte.id,
        nom: `${boissonOfferte.nom} (offerte — commande groupée)`,
        categorie: "boisson",
        quantite: 1,
        prixUnitaire: 0,
        coutMatiereUnitaire: boissonOfferte.cout_matiere ?? null,
        viandes: [],
        saveurs: [boissonOfferteSaveur],
        canetteIncluse: false,
        platIndex: null,
      });
    }
  }

  const coutIncomplet = lignes.some((l) => l.coutMatiereUnitaire === null);
  const coutMatiereTotal = lignes.reduce((total, l) => total + (l.coutMatiereUnitaire ?? 0) * l.quantite, 0);

  return { lignes, montantBrut, nbPlats, palierGroupe, coutMatiereTotal, coutIncomplet, produitParId };
}

/**
 * Crée une commande caisse (Module 1) : mêmes règles de validation que le
 * site public (/api/commande) — viandes/sauces à choix multiples, extras
 * illimités, choix de saveur de boisson, canette incluse, créneau souhaité
 * pour tous les canaux, et les mêmes règles de livraison (adresse/zone/
 * minimum de commande) pour une livraison prise au téléphone par la caisse —
 * recalculées côté serveur à partir de la carte en base (jamais de confiance
 * aveugle dans ce qu'envoie le navigateur). Une différence volontaire avec
 * le site public : un produit à prix libre (`prix IS NULL`, ex: "Plat du
 * jour") est ici autorisé, avec un prix du jour saisi par l'employé
 * (`prixSaisi`) au lieu d'être rejeté.
 *
 * Le créneau est demandé, validé et enregistré dans `heure_souhaitee` pour
 * tous les canaux : la page cuisine /commandes (suivi
 * en_attente/en_préparation/prêt/remise) en a besoin quel que soit le
 * canal, pas seulement pour une livraison.
 *
 * Nom et téléphone sont obligatoires pour tous les canaux (même règle que
 * /api/commande) : jamais de vente anonyme, y compris au comptoir.
 *
 * Sur place/à emporter : payé immédiatement au comptoir, `paiement_statut`
 * = 'paye' et paiement enregistré tout de suite. Livraison : le client
 * paie le livreur à la remise, pas la caisse à la prise de commande —
 * `paiement_statut` reste 'non_paye' (comme une livraison passée sur le
 * site public) jusqu'à être régularisée depuis /caisse/encaissements ou
 * /patron ("Encaissements livraison", cf. lib/encaissements-livraison.ts)
 * au retour du livreur. Dans les deux cas, c'est le trigger DB
 * `commandes_appliquer_fidelite` (déclenché sur INSERT ou sur passage de
 * `paiement_statut` à 'paye') qui gère l'accumulation/récompense fidélité
 * au bon moment.
 *
 * Hors scope volontaire de cette itération : déduction du stock (lots /
 * lot_mouvements) — la carte n'a pas encore de table de "recette" reliant un
 * produit à ses articles de stock consommés, ça viendra avec le Module 3.
 *
 * Renvoie `numero` (numéro de commande lisible) et `qrCode` (uniquement en
 * livraison, cf. table `livraisons`) pour que /caisse imprime le ticket
 * immédiatement après un "Encaisser" réussi, sans requête supplémentaire.
 */
export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreerCommandePayload | null;
  if (!body) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!CANAUX_CAISSE.includes(body.canal as (typeof CANAUX_CAISSE)[number])) {
    return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
  }

  if (!MODES_PAIEMENT_CAISSE.includes(body.modePaiement as (typeof MODES_PAIEMENT_CAISSE)[number])) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  // Nom et téléphone sont obligatoires pour tous les canaux, comme sur le
  // site public (/api/commande) : jamais de vente anonyme, y compris au
  // comptoir.
  const nom = (body.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }
  const prenom = (body.prenom ?? "").trim();
  if (!prenom) {
    return NextResponse.json({ error: "Le prénom est requis." }, { status: 400 });
  }
  const clientTelephone = normaliserTelephone(body.clientTelephone ?? "");
  if (!clientTelephone) {
    return NextResponse.json({ error: "Numéro de téléphone invalide — vérifie que tu l'as bien saisi (ex: 0639123456)." }, { status: 400 });
  }

  // Email : requis, sauf si ce numéro a déjà un email enregistré et que la
  // caissière a volontairement laissé le champ vide pour le garder.
  const emailSaisiBrut = (body.email ?? "").trim();
  let email: string | null = null;
  if (emailSaisiBrut) {
    email = normaliserEmail(emailSaisiBrut);
    if (!email) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
    }
  }

  const supabase = createServiceSupabaseClient();

  if (!email) {
    const { data: clientExistant } = await supabase.from("clients").select("email").eq("telephone", clientTelephone).maybeSingle();
    if (!clientExistant?.email) {
      return NextResponse.json({ error: "Adresse email requise." }, { status: 400 });
    }
  }

  // --- Paramètres de livraison (mêmes règles que le site public, cf.
  // /api/commande) : une livraison prise au téléphone par la caisse a
  // besoin des mêmes informations qu'une livraison passée en ligne. ---
  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] = await Promise.all([
    supabase.from("parametres_livraison").select("heure_debut, heure_fin, minimum_commande").eq("id", true).single(),
    supabase.from("zones_livraison").select("commune").eq("actif", true),
  ]);

  if (erreurParametres || !parametres) {
    return NextResponse.json({ error: "Erreur serveur (paramètres livraison)." }, { status: 500 });
  }
  if (erreurZones) {
    return NextResponse.json({ error: "Erreur serveur (zones livraison)." }, { status: 500 });
  }
  const communesActives = new Set((zones ?? []).map((z) => z.commune));

  // Le créneau est demandé et enregistré pour tous les canaux (comme le
  // site public : "Heure de passage souhaitée" pour sur place/à emporter,
  // "Créneau de livraison souhaité" pour la livraison) — la page cuisine
  // /commandes en a besoin pour toutes les commandes, pas seulement les
  // livraisons (suivi recue/en_préparation/prêt/remise, quel que soit le
  // canal).
  const creneauHeure = body.creneauHeure;
  if (typeof creneauHeure !== "string" || !creneauHeure) {
    return NextResponse.json({ error: "Créneau horaire requis." }, { status: 400 });
  }
  if (!creneauDansPlage(creneauHeure, parametres.heure_debut, parametres.heure_fin)) {
    return NextResponse.json(
      {
        error: `Créneau invalide : choisis une heure entre ${parametres.heure_debut.slice(0, 5)} et ${parametres.heure_fin.slice(0, 5)}.`,
      },
      { status: 400 }
    );
  }

  const heureSouhaitee = construireHeureSouhaiteeUtc(creneauHeure);
  if (!heureSouhaitee) {
    return NextResponse.json({ error: "Créneau horaire invalide." }, { status: 400 });
  }

  let validation;
  try {
    validation = await validerLignesCommande(supabase, body.lignes, body.boissonOfferteSaveur);
  } catch (e) {
    if (e instanceof ErreurValidation) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[/api/caisse/commandes] échec validation :", e);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }
  const { lignes, montantBrut, nbPlats, palierGroupe, coutMatiereTotal, coutIncomplet, produitParId } = validation;

  let tamponsUtilises = 0;
  let montant = Math.round(montantBrut * 100) / 100;

  // --- Règles spécifiques à la livraison (mêmes que /api/commande) ---
  let adresse: string | null = null;
  let zone: string | null = null;

  if (body.canal === "livraison") {
    adresse = (body.adresse ?? "").trim();
    zone = (body.zone ?? "").trim();

    if (!adresse) {
      return NextResponse.json({ error: "Adresse de livraison requise." }, { status: 400 });
    }
    if (!zone || !communesActives.has(zone)) {
      return NextResponse.json({ error: "Zone de livraison invalide." }, { status: 400 });
    }
    if (montant < parametres.minimum_commande) {
      return NextResponse.json(
        {
          error: `Minimum de commande pour la livraison : ${parametres.minimum_commande.toFixed(2)} €.`,
        },
        { status: 400 }
      );
    }
  }

  const nbTamponsDemandes = typeof body.nbTampons === "number" ? Math.floor(body.nbTampons) : 0;
  if (nbTamponsDemandes > 0) {
    const { nombre: tamponsDisponibles } = await compterTamponsDisponibles(supabase, clientTelephone);
    const maxUtilisable = Math.min(tamponsDisponibles, Math.floor(montantBrut / MONTANT_RECOMPENSE));
    if (nbTamponsDemandes > maxUtilisable) {
      return NextResponse.json({ error: "Ce client n'a pas assez de tampons disponibles pour ce montant." }, { status: 400 });
    }
    tamponsUtilises = nbTamponsDemandes;
    montant = Math.round((montantBrut - tamponsUtilises * MONTANT_RECOMPENSE) * 100) / 100;
  }

  // Le trigger DB `commandes_appliquer_fidelite` crée le client automatiquement,
  // mais seulement après l'insertion de la commande (AFTER INSERT) — trop tard
  // pour satisfaire la contrainte de clé étrangère `commandes_client_telephone_fkey`
  // au moment de l'insert. On s'assure donc ici que le client existe déjà.
  const { error: erreurUpsertClient } = await supabase
    .from("clients")
    .upsert({ telephone: clientTelephone }, { onConflict: "telephone", ignoreDuplicates: true });

  if (erreurUpsertClient) {
    console.error("[/api/caisse/commandes] échec upsert client :", erreurUpsertClient.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  // Identité (nom/prénom) toujours rafraîchie avec la commande la plus
  // récente — distinct des colonnes fidélité (montant_cumule, tampons...)
  // qui restent exclusivement écrites par le trigger de paiement.
  await supabase
    .from("clients")
    .update({ nom, prenom, ...(email ? { email } : {}) })
    .eq("telephone", clientTelephone);

  // Décrément atomique du stock du jour (plats du jour) — dernier garde-fou
  // contre la concurrence, en plus du pré-check informatif ci-dessus.
  const stockAVerifier = new Map<string, number>();
  for (const l of lignes) {
    const produit = produitParId.get(l.produitId);
    if (produit?.stock_jour !== null && produit?.stock_jour !== undefined) {
      stockAVerifier.set(l.produitId, (stockAVerifier.get(l.produitId) ?? 0) + l.quantite);
    }
  }
  if (stockAVerifier.size > 0) {
    const { error: erreurStock } = await supabase.rpc("decrementer_stocks_produits", {
      items: [...stockAVerifier.entries()].map(([produitId, quantite]) => ({ produitId, quantite })),
    });
    if (erreurStock) {
      return NextResponse.json(
        { error: "Un plat du jour de cette commande n'est plus disponible en quantité suffisante — vérifie le panier." },
        { status: 400 }
      );
    }
  }

  // `nom_livraison` sert désormais de nom client pour tous les canaux (nom
  // et téléphone sont obligatoires partout) et pas seulement pour la
  // livraison — même convention que /api/commande.
  //
  // Une livraison prise par téléphone n'est PAS payée à cet instant : le
  // client paie le livreur à la remise, pas la caisse à la prise de
  // commande (contrairement à sur place/à emporter, payés immédiatement au
  // comptoir). `paiement_statut` reste donc "non_paye" ici, exactement
  // comme une livraison passée sur le site public — elle est régularisée
  // plus tard depuis /caisse/encaissements ou /patron au retour du
  // livreur, ce qui déclenche alors le trigger de fidélité au bon moment.
  const paiementStatut = body.canal === "livraison" ? "non_paye" : "paye";

  let paiementsMixte: { mode: "especes" | "cb"; montant: number }[] | null = null;
  if (body.modePaiement === "mixte") {
    paiementsMixte = validerPaiementsMixte(body.paiements, montant);
    if (!paiementsMixte) {
      return NextResponse.json(
        { error: "Paiement mixte invalide : vérifie que les montants espèces + carte correspondent au total." },
        { status: 400 }
      );
    }
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .insert({
      canal: body.canal,
      contenu: lignes,
      montant,
      paiement_statut: paiementStatut,
      mode_paiement: body.modePaiement,
      client_telephone: clientTelephone,
      commande_par: session.profilId,
      cout_matiere_total: coutMatiereTotal,
      tampons_utilises: tamponsUtilises,
      nom_livraison: `${prenom} ${nom}`,
      prenom,
      adresse_livraison: adresse,
      zone_livraison: zone,
      heure_souhaitee: heureSouhaitee.toISOString(),
      nb_plats: nbPlats,
      palier_groupe: palierGroupe,
    })
    .select("id, numero")
    .single();

  if (erreurCommande || !commande) {
    console.error("[/api/caisse/commandes] échec insertion commande :", erreurCommande?.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  // QR de suivi livreur (Module 2) : même logique que /api/commande — posé
  // ici pour que le ticket imprimé ait un vrai QR pour une livraison prise
  // au téléphone par la caisse, jamais un jeton décoratif. Un échec ici ne
  // doit jamais faire échouer une commande déjà enregistrée.
  let qrCode: string | null = null;
  if (body.canal === "livraison") {
    const { data: livraison, error: erreurLivraison } = await supabase
      .from("livraisons")
      .insert({ commande_id: commande.id, heure_souhaitee: heureSouhaitee.toISOString() })
      .select("qr_code")
      .single();

    if (erreurLivraison) {
      console.error("[/api/caisse/commandes] échec insertion livraison :", erreurLivraison.message);
    } else {
      qrCode = livraison.qr_code;
    }
  }

  // Pas d'enregistrement de paiement ici pour une livraison : elle n'est pas
  // encore payée (cf. plus haut) — le paiement sera inséré au moment de
  // l'encaissement réel, depuis /patron.
  if (paiementStatut === "paye") {
    const lignesPaiement = paiementsMixte ?? [{ mode: body.modePaiement as "especes" | "cb", montant }];
    const { error: erreurPaiement } = await supabase
      .from("paiements")
      .insert(lignesPaiement.map((p) => ({ commande_id: commande.id, montant: p.montant, mode: p.mode })));

    if (erreurPaiement) {
      console.error("[/api/caisse/commandes] échec insertion paiement :", erreurPaiement.message);
      return NextResponse.json(
        {
          error: "Commande enregistrée mais échec de l'enregistrement du paiement. Préviens le patron.",
          commandeId: commande.id,
        },
        { status: 500 }
      );
    }

    await notifierPaiementConfirme(commande.id);
  } else {
    // Livraison prise par téléphone, non payée à cet instant : même
    // confirmation immédiate que sur le site public (notifierCommandeRecue),
    // sinon le client n'a aucune nouvelle avant l'encaissement réel par le
    // livreur, potentiellement des heures plus tard.
    await notifierCommandeRecue(commande.id).catch((e) =>
      console.error("[/api/caisse/commandes] échec notification réception :", e)
    );
  }

  return NextResponse.json({
    ok: true,
    commandeId: commande.id,
    numero: commande.numero,
    montant,
    coutMatiereTotal,
    coutIncomplet,
    qrCode,
  });
}

/**
 * Modifie le contenu d'une commande existante encore "en_attente" — mêmes
 * règles de validation que la création (POST), via `validerLignesCommande`.
 * `tampons_utilises` reste toujours inchangé (jamais togglable ici).
 * Le canal peut changer, sauf vers "livraison" depuis un canal déjà payé
 * (sur place/à emporter) — refusé explicitement, ça impliquerait de
 * "dépayer" et reverser la fidélité déjà créditée, trop risqué depuis cet
 * écran (annule et recrée dans ce cas précis). L'autre sens (livraison non
 * payée -> sur place/à emporter) est permis : le paiement est alors
 * collecté immédiatement (`paiement_statut` passe à "paye", ce qui
 * déclenche le trigger DB `commandes_appliquer_fidelite` au bon moment).
 * Si la commande était déjà payée et reste sur le même canal, ce même
 * trigger ajuste simplement l'accumulation déjà créditée par la différence
 * de montant. Le stock du jour déjà décompté est ajusté atomiquement
 * (restitution des anciennes quantités + décompte des nouvelles, annulé en
 * bloc si le stock est insuffisant pour la nouvelle composition).
 */
export async function PATCH(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ModifierCommandePayload | null;
  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!MODES_PAIEMENT_CAISSE.includes(body.modePaiement as (typeof MODES_PAIEMENT_CAISSE)[number])) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  const nom = (body.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }
  const prenom = (body.prenom ?? "").trim();
  if (!prenom) {
    return NextResponse.json({ error: "Le prénom est requis." }, { status: 400 });
  }
  const clientTelephone = normaliserTelephone(body.clientTelephone ?? "");
  if (!clientTelephone) {
    return NextResponse.json({ error: "Numéro de téléphone invalide — vérifie que tu l'as bien saisi (ex: 0639123456)." }, { status: 400 });
  }

  const emailSaisiBrut = (body.email ?? "").trim();
  let email: string | null = null;
  if (emailSaisiBrut) {
    email = normaliserEmail(emailSaisiBrut);
    if (!email) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
    }
  }

  const supabase = createServiceSupabaseClient();

  if (!email) {
    const { data: clientExistant } = await supabase.from("clients").select("email").eq("telephone", clientTelephone).maybeSingle();
    if (!clientExistant?.email) {
      return NextResponse.json({ error: "Adresse email requise." }, { status: 400 });
    }
  }

  const { data: commandeExistante, error: erreurExistante } = await supabase
    .from("commandes")
    .select("id, canal, statut, contenu, montant, paiement_statut, tampons_utilises, commande_par")
    .eq("id", body.commandeId)
    .maybeSingle();
  if (erreurExistante || !commandeExistante) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (commandeExistante.statut !== "en_attente") {
    return NextResponse.json(
      { error: 'Seules les commandes encore "En attente" peuvent être modifiées.' },
      { status: 400 }
    );
  }
  if (commandeExistante.tampons_utilises > 0) {
    return NextResponse.json(
      { error: "Cette commande a utilisé des tampons fidélité et ne peut pas être modifiée ici." },
      { status: 400 }
    );
  }

  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] = await Promise.all([
    supabase
      .from("parametres_livraison")
      .select("heure_debut, heure_fin, minimum_commande, remise_lancement_debut, remise_lancement_fin")
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
  const communesActives = new Set((zones ?? []).map((z) => z.commune));

  const creneauHeure = body.creneauHeure;
  if (typeof creneauHeure !== "string" || !creneauHeure) {
    return NextResponse.json({ error: "Créneau horaire requis." }, { status: 400 });
  }
  if (!creneauDansPlage(creneauHeure, parametres.heure_debut, parametres.heure_fin)) {
    return NextResponse.json(
      {
        error: `Créneau invalide : choisis une heure entre ${parametres.heure_debut.slice(0, 5)} et ${parametres.heure_fin.slice(0, 5)}.`,
      },
      { status: 400 }
    );
  }
  const heureSouhaitee = construireHeureSouhaiteeUtc(creneauHeure);
  if (!heureSouhaitee) {
    return NextResponse.json({ error: "Créneau horaire invalide." }, { status: 400 });
  }

  let validation;
  try {
    validation = await validerLignesCommande(supabase, body.lignes, body.boissonOfferteSaveur);
  } catch (e) {
    if (e instanceof ErreurValidation) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[/api/caisse/commandes PATCH] échec validation :", e);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }
  const { lignes, montantBrut, nbPlats, palierGroupe, coutMatiereTotal, coutIncomplet, produitParId } = validation;

  // La remise de lancement doit survivre à une modification : sans ça, un
  // employé qui corrige juste une commande passée sur le site public en
  // ferait perdre le bénéfice au client, sans que rien ne le signale.
  // Jamais recréée sur une commande créée en caisse (`commande_par` non
  // nul) — jamais éligible à la remise, comme à la création.
  let montant = Math.round(montantBrut * 100) / 100;
  if (
    commandeExistante.commande_par === null &&
    remiseLancementActive(parametres.remise_lancement_debut, parametres.remise_lancement_fin, dateMayotteIso()) &&
    montant >= SEUIL_REMISE_LANCEMENT
  ) {
    montant = Math.round((montant - MONTANT_REMISE_LANCEMENT) * 100) / 100;
  }

  // Le canal peut changer, sauf dans un sens : une commande sur place/à
  // emporter est toujours déjà payée (paiement_statut="paye" dès la
  // création, cf. POST) — en faire une livraison impliquerait de "dépayer"
  // et reverser la fidélité déjà créditée, trop risqué depuis cet écran.
  // L'autre sens (livraison non payée -> sur place/à emporter) est sans
  // risque : le paiement est simplement collecté maintenant, cf. plus bas.
  const ancienCanal = commandeExistante.canal;
  const canalDemande = typeof body.canal === "string" ? body.canal : ancienCanal;
  if (!CANAUX_CAISSE.includes(canalDemande as (typeof CANAUX_CAISSE)[number])) {
    return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
  }
  const canal = canalDemande as (typeof CANAUX_CAISSE)[number];
  if (canal === "livraison" && ancienCanal !== "livraison") {
    return NextResponse.json(
      {
        error:
          "Cette commande est déjà payée — impossible de la transformer en livraison depuis cet écran. Annule-la et recrée-la si besoin.",
      },
      { status: 400 }
    );
  }
  const passageVersRetrait = ancienCanal === "livraison" && canal !== "livraison";

  let adresse: string | null = null;
  let zone: string | null = null;
  if (canal === "livraison") {
    adresse = (body.adresse ?? "").trim();
    zone = (body.zone ?? "").trim();
    if (!adresse) {
      return NextResponse.json({ error: "Adresse de livraison requise." }, { status: 400 });
    }
    if (!zone || !communesActives.has(zone)) {
      return NextResponse.json({ error: "Zone de livraison invalide." }, { status: 400 });
    }
    if (montant < parametres.minimum_commande) {
      return NextResponse.json(
        { error: `Minimum de commande pour la livraison : ${parametres.minimum_commande.toFixed(2)} €.` },
        { status: 400 }
      );
    }
  }

  // Une livraison n'est payée qu'à la remise (cf. POST plus haut) : son
  // mode de paiement ne peut donc pas être "mixte" ici, aucun paiement
  // n'existe encore à ce stade pour cette commande.
  let paiementsMixte: { mode: "especes" | "cb"; montant: number }[] | null = null;
  if (body.modePaiement === "mixte") {
    if (canal === "livraison") {
      return NextResponse.json({ error: "Le paiement mixte ne s'applique pas à une livraison non encore payée." }, { status: 400 });
    }
    paiementsMixte = validerPaiementsMixte(body.paiements, montant);
    if (!paiementsMixte) {
      return NextResponse.json(
        { error: "Paiement mixte invalide : vérifie que les montants espèces + carte correspondent au total." },
        { status: 400 }
      );
    }
  }

  const { error: erreurUpsertClient } = await supabase
    .from("clients")
    .upsert({ telephone: clientTelephone }, { onConflict: "telephone", ignoreDuplicates: true });
  if (erreurUpsertClient) {
    console.error("[/api/caisse/commandes PATCH] échec upsert client :", erreurUpsertClient.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }
  await supabase
    .from("clients")
    .update({ nom, prenom, ...(email ? { email } : {}) })
    .eq("telephone", clientTelephone);

  // Ajustement atomique du stock du jour : restitue les anciennes quantités
  // (contenu avant modification) puis décompte les nouvelles, dans la même
  // transaction — jamais de stock à moitié ajusté si la nouvelle
  // composition dépasse ce qu'il reste.
  const anciennesLignes = Array.isArray(commandeExistante.contenu)
    ? (commandeExistante.contenu as { produitId?: string; quantite?: number }[])
    : [];
  const anciensAVerifier = new Map<string, number>();
  for (const l of anciennesLignes) {
    if (l.produitId && l.quantite) {
      anciensAVerifier.set(l.produitId, (anciensAVerifier.get(l.produitId) ?? 0) + l.quantite);
    }
  }
  const nouveauxAVerifier = new Map<string, number>();
  for (const l of lignes) {
    const produit = produitParId.get(l.produitId);
    if (produit?.stock_jour !== null && produit?.stock_jour !== undefined) {
      nouveauxAVerifier.set(l.produitId, (nouveauxAVerifier.get(l.produitId) ?? 0) + l.quantite);
    }
  }
  if (anciensAVerifier.size > 0 || nouveauxAVerifier.size > 0) {
    const { error: erreurStock } = await supabase.rpc("ajuster_stocks_produits", {
      anciens: [...anciensAVerifier.entries()].map(([produitId, quantite]) => ({ produitId, quantite })),
      nouveaux: [...nouveauxAVerifier.entries()].map(([produitId, quantite]) => ({ produitId, quantite })),
    });
    if (erreurStock) {
      return NextResponse.json(
        { error: "Un plat du jour de cette nouvelle composition n'est plus disponible en quantité suffisante." },
        { status: 400 }
      );
    }
  }

  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({
      canal,
      contenu: lignes,
      montant,
      // Passage livraison -> sur place/à emporter : le paiement est
      // collecté maintenant (cf. bloc paiements plus bas), donc "paye" dès
      // cette mise à jour — déclenche au passage le trigger de fidélité
      // (jamais touché dans les autres cas, pour ne pas perturber un statut
      // déjà correct).
      ...(passageVersRetrait ? { paiement_statut: "paye" as const } : {}),
      mode_paiement: body.modePaiement,
      client_telephone: clientTelephone,
      cout_matiere_total: coutMatiereTotal,
      nom_livraison: `${prenom} ${nom}`,
      prenom,
      adresse_livraison: adresse,
      zone_livraison: zone,
      heure_souhaitee: heureSouhaitee.toISOString(),
      nb_plats: nbPlats,
      palier_groupe: palierGroupe,
    })
    .eq("id", body.commandeId);
  if (erreurMaj) {
    console.error("[/api/caisse/commandes PATCH] échec mise à jour :", erreurMaj.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  // Passage livraison -> sur place/à emporter : supprime le suivi livreur
  // devenu sans objet (plus de QR à flasher pour une commande qui n'est
  // plus livrée). Best effort, comme à la création — ne doit jamais faire
  // échouer une modification déjà enregistrée.
  if (passageVersRetrait) {
    const { error: erreurSuppressionLivraison } = await supabase.from("livraisons").delete().eq("commande_id", body.commandeId);
    if (erreurSuppressionLivraison) {
      console.error("[/api/caisse/commandes PATCH] échec suppression suivi livraison :", erreurSuppressionLivraison.message);
    }
  }

  // Sur place/à emporter sont payés dès la création (cf. POST) : la
  // modification peut changer le mode et/ou le montant, donc les lignes de
  // `paiements` déjà enregistrées sont remplacées pour rester cohérentes —
  // jamais pour une livraison, dont le paiement n'existe pas encore ici.
  if (canal !== "livraison") {
    const { error: erreurSuppressionPaiements } = await supabase.from("paiements").delete().eq("commande_id", body.commandeId);
    if (erreurSuppressionPaiements) {
      console.error("[/api/caisse/commandes PATCH] échec suppression anciens paiements :", erreurSuppressionPaiements.message);
      return NextResponse.json(
        { error: "Commande modifiée mais échec de la mise à jour du paiement. Préviens le patron.", commandeId: body.commandeId },
        { status: 500 }
      );
    }
    const lignesPaiement = paiementsMixte ?? [{ mode: body.modePaiement as "especes" | "cb", montant }];
    const { error: erreurPaiement } = await supabase
      .from("paiements")
      .insert(lignesPaiement.map((p) => ({ commande_id: body.commandeId, montant: p.montant, mode: p.mode })));
    if (erreurPaiement) {
      console.error("[/api/caisse/commandes PATCH] échec insertion paiement :", erreurPaiement.message);
      return NextResponse.json(
        { error: "Commande modifiée mais échec de la mise à jour du paiement. Préviens le patron.", commandeId: body.commandeId },
        { status: 500 }
      );
    }
  }

  // Le paiement vient d'être confirmé (passage livraison -> retrait) : même
  // notification qu'un paiement comptoir classique, avec le bloc fidélité à
  // jour (le trigger a tourné sur la mise à jour de paiement_statut
  // ci-dessus) — pas la notification générique de modification, qui ne
  // reflèterait pas cette confirmation de paiement.
  if (passageVersRetrait) {
    await notifierPaiementConfirme(body.commandeId).catch((e) =>
      console.error("[/api/caisse/commandes PATCH] échec notification paiement :", e)
    );
  } else {
    await notifierCommandeModifiee(body.commandeId).catch((e) =>
      console.error("[/api/caisse/commandes PATCH] échec notification modification :", e)
    );
  }

  return NextResponse.json({ ok: true, commandeId: body.commandeId, montant, coutMatiereTotal, coutIncomplet });
}
