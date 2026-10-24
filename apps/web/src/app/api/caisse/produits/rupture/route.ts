import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { basculerRuptureProduit } from "@/lib/caisse/rupture";

export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { produitId?: string; enRupture?: boolean } | null;
  if (!body?.produitId || typeof body.produitId !== "string" || typeof body.enRupture !== "boolean") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await basculerRuptureProduit(body.produitId, body.enRupture);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
