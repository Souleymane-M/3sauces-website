import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";
import type { CreerCommandePayload, LigneCommande } from "@/lib/caisse/types";

const CANAUX_CAISSE = ["sur_place", "emporter", "livraison"] as const;
const MODES_PAIEMENT_CAISSE = ["especes", "cb"] as const;
const MONTANT_RECOMPENSE = 10;

/**
 * Crée une commande caisse (Module 1) : recalcule prix/coût matière côté
 * serveur à partir de la carte en base (jamais de confiance aveugle dans ce
 * qu'envoie le navigateur), enregistre le paiement, et laisse le trigger DB
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

  if (!CANAUX_CAISSE.includes(body.canal as (typeof CANAUX_CAISSE)[number])) {
    return NextResponse.json({ error: "Canal invalide." }, { status: 400 });
  }

  if (!MODES_PAIEMENT_CAISSE.includes(body.modePaiement as (typeof MODES_PAIEMENT_CAISSE)[number])) {
    return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const produitIds = [...new Set(body.lignes.map((l) => l.produitId))];
  const { data: produits, error: erreurProduits } = await supabase
    .from("produits")
    .select("id, nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, actif")
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

  for (const ligneBrute of body.lignes) {
    const produit = produitParId.get(ligneBrute.produitId);
    if (!produit || !produit.actif) {
      return NextResponse.json(
        { error: `Produit introuvable ou inactif : ${ligneBrute.produitId}` },
        { status: 400 }
      );
    }

    const quantite = Number(ligneBrute.quantite);
    if (!Number.isInteger(quantite) || quantite < 1) {
      return NextResponse.json(
        { error: `Quantité invalide pour ${produit.nom}.` },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: `Viande invalide sur la ligne ${produit.nom}.` },
        { status: 400 }
      );
    }

    let prixUnitaire = produit.prix;
    if (prixUnitaire === null) {
      const prixSaisi = Number(ligneBrute.prixSaisi);
      if (!Number.isFinite(prixSaisi) || prixSaisi <= 0) {
        return NextResponse.json(
          { error: `${produit.nom} est à prix libre : indique un prix du jour.` },
          { status: 400 }
        );
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
      canetteIncluse: produit.canette_incluse,
    });
  }

  const montantBrut = lignes.reduce((total, l) => total + l.prixUnitaire * l.quantite, 0);

  const coutIncomplet = lignes.some((l) => l.coutMatiereUnitaire === null);
  const coutMatiereTotal = lignes.reduce(
    (total, l) => total + (l.coutMatiereUnitaire ?? 0) * l.quantite,
    0
  );

  let clientTelephone: string | null = null;
  let recompenseAppliquee = false;
  let montant = Math.round(montantBrut * 100) / 100;

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
        return NextResponse.json(
          { error: "Ce client n'a pas de récompense disponible." },
          { status: 400 }
        );
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
      return NextResponse.json(
        { error: `Erreur serveur (création client) : ${erreurUpsertClient.message}` },
        { status: 500 }
      );
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
    })
    .select("id")
    .single();

  if (erreurCommande || !commande) {
    return NextResponse.json(
      { error: `Échec de l'enregistrement de la commande : ${erreurCommande?.message ?? "inconnu"}` },
      { status: 500 }
    );
  }

  const { error: erreurPaiement } = await supabase.from("paiements").insert({
    commande_id: commande.id,
    montant,
    mode: body.modePaiement,
  });

  if (erreurPaiement) {
    return NextResponse.json(
      {
        error: `Commande enregistrée mais échec de l'enregistrement du paiement : ${erreurPaiement.message}`,
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
