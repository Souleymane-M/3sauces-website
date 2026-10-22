import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerLivraisonsAssignees, listerLivraisonsEnAttente } from "@/lib/livreur/commandes";

/**
 * Sondé en direct par /livreur (cf. livreur-app.tsx) pour les deux listes
 * d'un coup : celles déjà prises par CE livreur, et celles en attente de
 * n'importe qui — demande explicite du patron, 2026-10-22, pour que la
 * liste "en attente" se tienne à jour sans que le livreur n'ait à
 * rafraîchir manuellement.
 */
export async function GET() {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const [livraisons, enAttente] = await Promise.all([
      listerLivraisonsAssignees(session.profilId),
      listerLivraisonsEnAttente(session.profilId),
    ]);
    return NextResponse.json({ livraisons, enAttente });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
