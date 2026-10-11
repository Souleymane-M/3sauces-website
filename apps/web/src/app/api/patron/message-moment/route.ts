import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { definirMessageDuMoment } from "@/lib/patron/parametres";
import { LIMITE_MESSAGE_MOMENT } from "@/lib/patron/message-moment-constants";

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { texte?: unknown; actif?: unknown } | null;
  const texte = typeof body?.texte === "string" ? body.texte : null;
  const actif = body?.actif === true;

  if (texte !== null && texte.length > LIMITE_MESSAGE_MOMENT) {
    return NextResponse.json({ error: `Le message ne doit pas dépasser ${LIMITE_MESSAGE_MOMENT} caractères.` }, { status: 400 });
  }

  try {
    await definirMessageDuMoment(texte === "" ? null : texte, actif);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
