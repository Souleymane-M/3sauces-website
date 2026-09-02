import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { normaliserTelephone } from "@/lib/telephone";
import { construireHeureSouhaiteeUtc, creneauDansPlage } from "@/lib/commande-publique/creneau";
import { limiterDebit } from "@/lib/auth/rate-limit";
import type {
  CanalPublic,
  CreerCommandePubliquePayload,
  LigneCommandePubliquePayload,
} from "@/lib/commande-publique/types";
import type { LigneCommande } from "@/lib/caisse/types";

const CANAUX_PUBLICS = ["sur_place", "livraison"] as const;
const MODES_PAIEMENT_PUBLICS = ["especes", "cb"] as const;

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
 * revérifié ici à partir de la base. `paiement_statut` reste "non_paye" :
 * le paiement a lieu en personne (espèces ou CB SumUp) à la livraison ou au
 * retrait, jamais en ligne pour cette itération.
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

  const supabase = createServiceSupabaseClient();

  // --- Paramètres de livraison (source de vérité : jamais codés en dur) ---
  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] =
    await Promise.all([
      supabase
        .from("parametres_livraison")
        .select("heure_debut, heure_fin, minimum_commande")
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
    .select("id, nom, categorie, prix, nb_viandes_max, actif")
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

    lignes.push({
      produitId: produit.id,
      nom: produit.nom,
      categorie: produit.categorie,
      quantite,
      prixUnitaire: produit.prix,
      coutMatiereUnitaire: null, // donnée interne, jamais calculée pour une commande publique
      viandes,
      canetteIncluse: false,
    });
  }

  const montant = Math.round(lignes.reduce((t, l) => t + l.prixUnitaire * l.quantite, 0) * 100) / 100;

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

  const heureSouhaitee = construireHeureSouhaiteeUtc(creneauHeure);
  if (!heureSouhaitee) {
    return NextResponse.json({ error: "Créneau horaire invalide." }, { status: 400 });
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
      montant,
      // Paiement en personne (espèces/CB) à la livraison ou au retrait —
      // jamais de paiement en ligne dans cette itération. En laissant
      // paiement_statut à "non_paye", on évite aussi de déclencher le
      // trigger de fidélité, hors scope pour ce MVP.
      paiement_statut: "non_paye",
      mode_paiement: body.modePaiement,
      client_telephone: telephone,
      nom_livraison: nom,
      adresse_livraison: adresse,
      zone_livraison: zone,
      heure_souhaitee: heureSouhaitee.toISOString(),
    })
    .select("id")
    .single();

  if (erreurCommande || !commande) {
    console.error("[/api/commande] échec insertion commande :", erreurCommande?.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    commandeId: commande.id,
    montant,
    creneauHeure,
  });
}
