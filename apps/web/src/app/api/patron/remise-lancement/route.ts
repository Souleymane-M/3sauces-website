import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { dateIsoValide } from "@/lib/commande-publique/creneau";
import { definirRemiseLancement } from "@/lib/patron/parametres";

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { debut?: unknown; fin?: unknown } | null;
  const debut = body?.debut === null ? null : typeof body?.debut === "string" ? body.debut : undefined;
  const fin = body?.fin === null ? null : typeof body?.fin === "string" ? body.fin : undefined;

  if (debut === undefined || fin === undefined) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if ((debut !== null && !dateIsoValide(debut)) || (fin !== null && !dateIsoValide(fin))) {
    return NextResponse.json({ error: "Format de date invalide." }, { status: 400 });
  }
  if (debut !== null && fin !== null && debut > fin) {
    return NextResponse.json({ error: "La date de fin doit être après la date de début." }, { status: 400 });
  }

  try {
    await definirRemiseLancement(debut, fin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
