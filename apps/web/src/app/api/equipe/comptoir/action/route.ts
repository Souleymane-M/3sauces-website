import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { changerStatutCommande, annulerCommande } from "@/lib/cuisine/commandes";

/**
 * Actions COMPTOIR : "Remise" (sur place/à emporter, après paiement) et
 * "Annuler" — `annulerCommande` refuse déjà elle-même toute annulation
 * passé "en_attente", côté serveur, peu importe l'appelant (demande
 * explicite du patron : vérifiable par appel direct à l'API).
 */
export async function PATCH(request: Request) {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; action?: string; profilId?: string; motif?: string }
    | null;

  const { commandeId, action, profilId, motif } = body ?? {};
  if (!commandeId || !profilId || (action !== "remise" && action !== "annuler")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    if (action === "remise") {
      await changerStatutCommande({ commandeId, statut: "remis_au_client", profilId, roleMetier: "comptoir" });
    } else {
      await annulerCommande({ commandeId, profilId, motif });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
