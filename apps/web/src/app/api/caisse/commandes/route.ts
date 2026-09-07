import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";
import { NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE } from "@/lib/commande-publique/types";
import { construireHeureSouhaiteeUtc, creneauDansPlage } from "@/lib/commande-publique/creneau";
import type { CreerCommandePayload, LigneCommande, LigneCommandePayload } from "@/lib/caisse/types";

const CANAUX_CAISSE = ["sur_place", "emporter", "livraison"] as const;
const MODES_PAIEMENT_CAISSE = ["especes", "cb"] as const;
const MONTANT_RECOMPENSE = 10;

// Même plafonds anti-abus que le site public (cf. /api/commande) — un
// panier caisse "normal" ne les dépasse jamais.
const MAX_LIGNES_PAR_COMMANDE = 30;
const MAX_QUANTITE_PAR_LIGNE = 20;

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
 * Le créneau est demandé et validé pour tous les canaux, mais seule une
 * livraison l'enregistre dans `heure_souhaitee` : une vente sur place/à
 * emporter est payée et remise immédiatement, elle n'a pas besoin du suivi
 * recue/en_préparation/livrée du flux de commandes en attente
 * (`listerCommandesAdmin`, filtré sur ce champ) — contrairement à une
 * livraison, qui en a besoin au même titre qu'une commande passée en ligne.
 *
 * Enregistre le paiement, et laisse le trigger DB
 * `commandes_appliquer_fidelite` gérer l'accumulation/récompense fidélité
 * (déclenché automatiquement à l'insertion si paiement_statut = 'paye').
 *
 * Hors scope volontaire de cette itération : déduction du stock (lots /
 * lot_mouvements) — la carte n'a pas encore de table de "recette" reliant un
 * produit à ses articles de stock consommés, ça viendra avec le Module 3.
 */
export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreerCommandePayload | null;
  if (!body || !Array.isArray(body.lignes) || body.lignes.length === 0) {
    return NextResponse.json(
      { error: "Requête invalide : au moins une ligne de commande est requise." },
      { status: 400 }
    );
  }
  if (body.lignes.length > MAX_LIGNES_PAR_COMMANDE) {
    return NextResponse.json({ error: "Panier trop volumineux." }, { status: 400 });
  }

  if (!CANAUX_CAISSE.includes(body.canal as (typeof CANAUX_CAISSE)[number])) {
    return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
  }

  if (!MODES_PAIEMENT_CAISSE.includes(body.modePaiement as (typeof MODES_PAIEMENT_CAISSE)[number])) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

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

  // Le créneau est désormais demandé pour tous les canaux (comme le site
  // public : "Heure de passage souhaitée" pour sur place/à emporter,
  // "Créneau de livraison souhaité" pour la livraison) et validé dans tous
  // les cas. En revanche, seule une livraison l'enregistre dans
  // `heure_souhaitee` : une vente sur place/à emporter est payée et remise
  // immédiatement, elle n'a pas besoin du suivi recue/en_préparation/livrée
  // du flux de commandes en attente — contrairement à une livraison, qui en
  // a besoin au même titre qu'une commande passée en ligne.
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

  let heureSouhaitee: Date | null = null;
  if (body.canal === "livraison") {
    heureSouhaitee = construireHeureSouhaiteeUtc(creneauHeure);
    if (!heureSouhaitee) {
      return NextResponse.json({ error: "Créneau de livraison invalide." }, { status: 400 });
    }
  }

  const produitIds = [...new Set(body.lignes.map((l) => l.produitId))];
  const { data: produits, error: erreurProduits } = await supabase
    .from("produits")
    .select(
      "id, nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, viande_imposee, nb_sauces_incluses, nb_saveurs_max, actif"
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

  const produitParId = new Map((produits ?? []).map((p) => [p.id, p]));
  const lignes: LigneCommande[] = [];

  for (const ligneBrute of body.lignes as LigneCommandePayload[]) {
    const produit = produitParId.get(ligneBrute.produitId);
    if (!produit || !produit.actif) {
      return NextResponse.json({ error: `Produit introuvable ou inactif : ${ligneBrute.produitId}` }, { status: 400 });
    }

    const quantite = Number(ligneBrute.quantite);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > MAX_QUANTITE_PAR_LIGNE) {
      return NextResponse.json({ error: `Quantité invalide pour ${produit.nom}.` }, { status: 400 });
    }

    const viandes = Array.isArray(ligneBrute.viandes) ? ligneBrute.viandes : [];
    if (viandes.length !== produit.nb_viandes_max) {
      return NextResponse.json(
        { error: `${produit.nom} nécessite exactement ${produit.nb_viandes_max} viande(s) sélectionnée(s).` },
        { status: 400 }
      );
    }
    if (viandes.some((v) => !nomsViandesValides.has(v))) {
      return NextResponse.json({ error: `Viande invalide sur la ligne ${produit.nom}.` }, { status: 400 });
    }

    // Produit "verrouillé" (ex: Menu Collégien) : la viande envoyée doit
    // correspondre à la viande imposée en base.
    if (produit.viande_imposee && viandes[0] !== produit.viande_imposee) {
      return NextResponse.json(
        { error: `${produit.nom} est disponible uniquement en ${produit.viande_imposee}.` },
        { status: 400 }
      );
    }

    // Sauces : même double régime que /api/commande — "Sauce supplémentaire"
    // exige exactement 1 sauce par ligne, sinon le maximum vient de
    // `nb_sauces_incluses` du produit lui-même.
    const sauces = Array.isArray(ligneBrute.sauces) ? ligneBrute.sauces : [];
    const estSauceSupplementaire = produit.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE;
    if (estSauceSupplementaire) {
      if (sauces.length !== 1) {
        return NextResponse.json({ error: "Sélectionne exactement une sauce supplémentaire." }, { status: 400 });
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
    }
    if (new Set(sauces).size !== sauces.length) {
      return NextResponse.json({ error: `Sauce en double sur la ligne ${produit.nom}.` }, { status: 400 });
    }
    if (sauces.some((s) => !nomsSaucesValides.has(s))) {
      return NextResponse.json({ error: `Sauce invalide sur la ligne ${produit.nom}.` }, { status: 400 });
    }

    // Saveur (produit vendu directement à la saveur, ex: Canette 33cl) : un
    // choix exact et obligatoire dès que `nb_saveurs_max > 0`.
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

    // Boisson incluse (Tacos/Barquette/Bowl/Menu Étudiant) : n'a de sens que
    // si le produit inclut effectivement une canette.
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

    // Différence caisse : un produit à prix libre (ex: "Plat du jour") est
    // autorisé ici (jamais côté public), avec un prix du jour saisi par
    // l'employé plutôt qu'un rejet.
    let prixUnitaire = produit.prix;
    if (prixUnitaire === null) {
      const prixSaisi = Number(ligneBrute.prixSaisi);
      if (!Number.isFinite(prixSaisi) || prixSaisi <= 0) {
        return NextResponse.json({ error: `${produit.nom} est à prix libre : indique un prix du jour.` }, { status: 400 });
      }
      prixUnitaire = prixSaisi;
    }

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
      canetteIncluse: produit.canette_incluse,
    });
  }

  const montantBrut = lignes.reduce((total, l) => total + l.prixUnitaire * l.quantite, 0);

  const coutIncomplet = lignes.some((l) => l.coutMatiereUnitaire === null);
  const coutMatiereTotal = lignes.reduce((total, l) => total + (l.coutMatiereUnitaire ?? 0) * l.quantite, 0);

  let clientTelephone: string | null = null;
  let recompenseAppliquee = false;
  let montant = Math.round(montantBrut * 100) / 100;

  // --- Règles spécifiques à la livraison (mêmes que /api/commande) ---
  let nomLivraison: string | null = null;
  let adresse: string | null = null;
  let zone: string | null = null;

  if (body.canal === "livraison") {
    nomLivraison = (body.nom ?? "").trim() || null;
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

  if (body.clientTelephone) {
    const telephoneNormalise = normaliserTelephone(body.clientTelephone);
    if (!telephoneNormalise) {
      return NextResponse.json({ error: "Numéro de téléphone client invalide." }, { status: 400 });
    }
    clientTelephone = telephoneNormalise;

    if (body.recompenseAppliquee) {
      const { data: client } = await supabase
        .from("clients")
        .select("recompense_disponible")
        .eq("telephone", clientTelephone)
        .maybeSingle();

      if (!client?.recompense_disponible) {
        return NextResponse.json({ error: "Ce client n'a pas de récompense disponible." }, { status: 400 });
      }
      recompenseAppliquee = true;
      montant = Math.max(0, Math.round((montantBrut - MONTANT_RECOMPENSE) * 100) / 100);
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
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .insert({
      canal: body.canal,
      contenu: lignes,
      montant,
      paiement_statut: "paye",
      mode_paiement: body.modePaiement,
      client_telephone: clientTelephone,
      commande_par: session.profilId,
      cout_matiere_total: coutMatiereTotal,
      recompense_appliquee: recompenseAppliquee,
      nom_livraison: nomLivraison,
      adresse_livraison: adresse,
      zone_livraison: zone,
      heure_souhaitee: heureSouhaitee ? heureSouhaitee.toISOString() : null,
    })
    .select("id")
    .single();

  if (erreurCommande || !commande) {
    console.error("[/api/caisse/commandes] échec insertion commande :", erreurCommande?.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  const { error: erreurPaiement } = await supabase.from("paiements").insert({
    commande_id: commande.id,
    montant,
    mode: body.modePaiement,
  });

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

  return NextResponse.json({
    ok: true,
    commandeId: commande.id,
    montant,
    coutMatiereTotal,
    coutIncomplet,
  });
}
