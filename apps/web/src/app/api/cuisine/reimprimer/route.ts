import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { demanderReimpressionTicket } from "@/lib/caisse/nouvelles-commandes";

/** Ticket perdu/abîmé — redemande l'impression des 2 tickets, cf. `demanderReimpressionTicket`. */
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
    await demanderReimpressionTicket(body.commandeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
