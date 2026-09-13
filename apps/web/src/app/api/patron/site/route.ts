import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { basculerSiteOuvert } from "@/lib/patron/parametres";

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { ouvert?: boolean } | null;
  if (typeof body?.ouvert !== "boolean") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await basculerSiteOuvert(body.ouvert);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
