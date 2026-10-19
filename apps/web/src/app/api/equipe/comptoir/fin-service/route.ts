import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { listerCommandesNonCloturees, cloturerCommandeFinService, MOTIFS_FIN_SERVICE } from "@/lib/cuisine/commandes";

export async function GET() {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  try {
    const commandes = await listerCommandesNonCloturees();
    return NextResponse.json({ commandes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; motif?: string; profilId?: string }
    | null;

  const { commandeId, motif, profilId } = body ?? {};
  if (!commandeId || !profilId || !MOTIFS_FIN_SERVICE.includes(motif as (typeof MOTIFS_FIN_SERVICE)[number])) {
    return NextResponse.json({ error: "Requête invalide : motif obligatoire." }, { status: 400 });
  }

  try {
    await cloturerCommandeFinService({
      commandeId,
      profilId,
      motif: motif as (typeof MOTIFS_FIN_SERVICE)[number],
      roleMetier: "comptoir",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
