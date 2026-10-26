import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { changerStatutCommande, annulerCommande } from "@/lib/cuisine/commandes";
import { relacherLivraison } from "@/lib/livreur/commandes";
import { changerCanalCommande } from "@/lib/cuisine/changer-canal";

const ACTIONS_VALIDES = ["remise", "annuler", "relacher_livreur", "changer_canal"] as const;
type Action = (typeof ACTIONS_VALIDES)[number];

/**
 * Actions COMPTOIR : "Remise" (sur place/à emporter, après paiement),
 * "Annuler" — `annulerCommande` refuse déjà elle-même toute annulation
 * passé "en_attente", côté serveur, peu importe l'appelant (demande
 * explicite du patron : vérifiable par appel direct à l'API) — et
 * "relacher_livreur" (le livreur assigné ne peut plus livrer, le comptoir
 * force la remise au pot commun, cf. `relacherLivraison`).
 */
export async function PATCH(request: Request) {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; action?: string; profilId?: string; motif?: string; canal?: string; adresse?: string; zone?: string }
    | null;

  const { commandeId, action, profilId, motif } = body ?? {};
  if (!commandeId || !profilId || !ACTIONS_VALIDES.includes(action as Action)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    if (action === "remise") {
      await changerStatutCommande({ commandeId, statut: "remis_au_client", profilId, roleMetier: "comptoir" });
    } else if (action === "changer_canal") {
      await changerCanalCommande({ commandeId, canal: body?.canal ?? "", adresse: body?.adresse, zone: body?.zone });
    } else if (action === "annuler") {
      await annulerCommande({ commandeId, profilId, motif });
    } else {
      await relacherLivraison(commandeId, profilId, "comptoir");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
