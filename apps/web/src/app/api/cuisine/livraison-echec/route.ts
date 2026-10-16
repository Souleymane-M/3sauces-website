import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { resoudreLivraisonSignalee } from "@/lib/cuisine/commandes";

/** Résolution d'une livraison signalée "impossible à livrer" (colonne "En cours de livraison") — cf. `resoudreLivraisonSignalee`. */
export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; action?: string; motif?: string; profilId?: string }
    | null;

  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (body.action !== "remettre" && body.action !== "annuler") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }
  if (!body.profilId || typeof body.profilId !== "string") {
    return NextResponse.json({ error: "Identité employé requise." }, { status: 400 });
  }

  try {
    await resoudreLivraisonSignalee(body.commandeId, body.profilId, body.action, body.motif);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
