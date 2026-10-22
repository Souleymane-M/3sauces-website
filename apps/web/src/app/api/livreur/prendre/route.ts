import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { prendreLivraisonParQrCode, prendreLivraisonParCommandeId } from "@/lib/livreur/commandes";

/**
 * Prise en charge d'une livraison — soit par scan du QR imprimé sur le
 * ticket (`qrCode`), soit directement depuis la liste "en attente" de
 * /livreur sans scanner (`commandeId`), demande explicite du patron,
 * 2026-10-22. Exactement un des deux doit être fourni.
 */
export async function POST(request: Request) {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { qrCode?: string; commandeId?: string } | null;

  try {
    if (body?.qrCode && typeof body.qrCode === "string") {
      await prendreLivraisonParQrCode(body.qrCode, session.profilId);
    } else if (body?.commandeId && typeof body.commandeId === "string") {
      await prendreLivraisonParCommandeId(body.commandeId, session.profilId);
    } else {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
