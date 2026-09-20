import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerCommandesAImprimerDifferees, marquerTicketImprime } from "@/lib/caisse/nouvelles-commandes";

export async function GET(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const heureDebut = searchParams.get("heureDebut");
  if (!heureDebut) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const commandes = await listerCommandesAImprimerDifferees(heureDebut);
    return NextResponse.json({ commandes });
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
