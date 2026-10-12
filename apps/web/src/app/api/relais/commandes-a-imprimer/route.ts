import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { construireTicketClientXml, construireBonCuisineXml } from "@/lib/impression/epos-print";
import { marquerTicketImprime, listerCommandesDuJourAImprimer } from "@/lib/caisse/nouvelles-commandes";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";

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
    const commandesPourImpression = await listerCommandesDuJourAImprimer();

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
