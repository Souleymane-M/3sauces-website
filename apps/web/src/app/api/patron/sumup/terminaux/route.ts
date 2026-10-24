import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerTerminauxSumupAdmin, jumelerTerminalSumup } from "@/lib/patron/terminaux-sumup";

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const terminaux = await listerTerminauxSumupAdmin();
    return NextResponse.json({ terminaux });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { pairingCode?: string; nom?: string } | null;
  const pairingCode = (body?.pairingCode ?? "").trim();
  const nom = (body?.nom ?? "").trim();
  if (!pairingCode || pairingCode.length < 8 || pairingCode.length > 9) {
    return NextResponse.json({ error: "Code de jumelage invalide (8 ou 9 caractères attendus)." }, { status: 400 });
  }
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }

  try {
    const terminal = await jumelerTerminalSumup(pairingCode, nom);
    return NextResponse.json({ terminal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
