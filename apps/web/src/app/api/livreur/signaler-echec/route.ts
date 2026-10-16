import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { signalerLivraisonNonEffectuee } from "@/lib/livreur/commandes";

/** Le livreur ne peut pas remettre la commande — alerte immédiate du restaurant, cf. `signalerLivraisonNonEffectuee`. */
export async function POST(request: Request) {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { commandeId?: string; motif?: string } | null;
  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await signalerLivraisonNonEffectuee(body.commandeId, session.profilId, session.nom, body.motif ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
