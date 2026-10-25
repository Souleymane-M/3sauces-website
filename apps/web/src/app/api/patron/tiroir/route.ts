import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { annulerMouvement } from "@/lib/caisse/tiroir";

// Annulation d'une ligne du tiroir : réservée au patron (jamais déléguée).
export async function POST(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id || typeof body.id !== "string") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  try {
    const ok = await annulerMouvement(body.id, session.profilId);
    if (!ok) return NextResponse.json({ error: "Ligne introuvable ou déjà annulée." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
