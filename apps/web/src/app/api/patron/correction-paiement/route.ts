import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { corrigerModePaiement } from "@/lib/patron/correction-paiement";

// Réservé au patron : jamais délégué.
export async function POST(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { commandeId?: string; mode?: string } | null;
  if (!body?.commandeId || typeof body.commandeId !== "string" || typeof body.mode !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  try {
    await corrigerModePaiement(body.commandeId, body.mode, session.profilId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 400 });
  }
}
