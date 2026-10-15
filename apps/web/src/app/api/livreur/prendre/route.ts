import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { prendreLivraisonParQrCode } from "@/lib/livreur/commandes";

/** Prise en charge d'une livraison par scan du QR imprimé sur le ticket — cf. `prendreLivraisonParQrCode`. */
export async function POST(request: Request) {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { qrCode?: string } | null;
  if (!body?.qrCode || typeof body.qrCode !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await prendreLivraisonParQrCode(body.qrCode, session.profilId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
