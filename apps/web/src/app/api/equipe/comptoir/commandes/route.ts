import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { listerCommandesActives } from "@/lib/cuisine/commandes";

/**
 * Commandes pour la vue COMPTOIR : toutes les infos (montant, statut de
 * paiement, coordonnées client) sont nécessaires pour encaisser et
 * remettre — à la différence de la vue CUISINE, rien à restreindre ici.
 */
export async function GET() {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const commandes = await listerCommandesActives();
    return NextResponse.json({ commandes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
