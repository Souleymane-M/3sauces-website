import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { CommandePourImpression } from "@/lib/impression/types";
import { construireTicketClientXml, construireBonCuisineXml } from "@/lib/impression/epos-print";
import { marquerTicketImprime } from "@/lib/caisse/nouvelles-commandes";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";

const SELECT_POUR_IMPRESSION =
  "id, numero, canal, contenu, montant, mode_paiement, paiement_statut, nom_livraison, adresse_livraison, heure_souhaitee, created_at, nb_plats";

/**
 * Pensé pour le relais d'impression (scripts/relais-impression/), qui
 * tourne en permanence sur le réseau du restaurant, indépendamment de tout
 * onglet /caisse ouvert — contrairement à /api/caisse/commandes-a-imprimer
 * (pensé pour un curseur de polling côté navigateur), celui-ci renvoie
 * directement tout ce qui reste non imprimé aujourd'hui (le vrai
 * garde-fou anti-doublon est `ticket_imprime_le`, pas un curseur temporel
 * fragile) — jamais de risque de rater une commande après un redémarrage
 * du relais.
 *
 * Construit le XML prêt à envoyer (ticket client + bon cuisine) ici,
 * côté serveur, puisque le relais est un simple script Node sans accès
 * aux fonctions React/TS de l'app. Pas de logo sur le ticket client dans
 * ce circuit : le rendu du logo (`logo-raster.ts`) dépend du Canvas du
 * navigateur, indisponible côté serveur — différence purement visuelle,
 * jamais bloquante.
 */
export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { debut, fin } = plageJourMayotteUtc(dateMayotteIso());

    const { data: commandes, error } = await supabase
      .from("commandes")
      .select(SELECT_POUR_IMPRESSION)
      .is("commande_par", null)
      .is("ticket_imprime_le", null)
      .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
      // Jamais le gros arriéré de commandes jamais imprimées avant ce
      // circuit (plus de 100 commandes anciennes, jamais marquées — repéré
      // le 2026-10-10) : uniquement une heure souhaitée dans la fenêtre
      // d'aujourd'hui (couvre à la fois une commande du jour même et une
      // commande à l'avance dont le jour est enfin arrivé).
      .gte("heure_souhaitee", debut.toISOString())
      .lt("heure_souhaitee", fin.toISOString())
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      throw new Error(`Impossible de charger les commandes à imprimer : ${error.message}`);
    }

    const idsLivraison = (commandes ?? []).filter((c) => c.canal === "livraison").map((c) => c.id);
    const qrCodeParCommandeId = new Map<string, string>();
    if (idsLivraison.length > 0) {
      const { data: livraisons, error: erreurLivraisons } = await supabase
        .from("livraisons")
        .select("commande_id, qr_code")
        .in("commande_id", idsLivraison);
      if (erreurLivraisons) {
        throw new Error(`Impossible de charger les QR de livraison : ${erreurLivraisons.message}`);
      }
      for (const l of livraisons ?? []) {
        qrCodeParCommandeId.set(l.commande_id, l.qr_code);
      }
    }

    const commandesPourImpression: CommandePourImpression[] = (commandes ?? []).map((c) => ({
      id: c.id,
      numero: c.numero,
      canal: c.canal,
      lignes: (c.contenu as LigneCommande[]) ?? [],
      montant: c.montant,
      modePaiement: c.mode_paiement ?? "especes",
      nom: c.nom_livraison ?? "",
      adresse: c.adresse_livraison,
      heureSouhaitee: c.heure_souhaitee,
      creeLe: c.created_at,
      qrCode: qrCodeParCommandeId.get(c.id) ?? null,
      nbPlats: c.nb_plats,
    }));

    const imprimantes = await listerImprimantesAdmin();
    const comptoir = imprimantes.find((i) => i.role === "comptoir");
    const cuisine = imprimantes.find((i) => i.role === "cuisine");

    return NextResponse.json({
      commandes: commandesPourImpression.map((commande) => ({
        id: commande.id,
        numero: commande.numero,
        clientXml: construireTicketClientXml(commande, null),
        cuisineXml: construireBonCuisineXml(commande),
      })),
      imprimantes: {
        comptoir: comptoir?.adresseIp ? { adresseIp: comptoir.adresseIp, port: comptoir.port } : null,
        cuisine: cuisine?.adresseIp ? { adresseIp: cuisine.adresseIp, port: cuisine.port } : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { commandeId?: string } | null;
  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await marquerTicketImprime(body.commandeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
