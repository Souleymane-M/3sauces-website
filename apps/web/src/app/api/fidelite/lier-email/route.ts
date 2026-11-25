import { NextResponse } from "next/server";

/**
 * FERMÉE le 2026-11-25 : cette route attachait n'importe quel email à un numéro sans email, sans aucune preuve — donc
 * n'importe qui pouvait « s'approprier » le compte fidélité d'un autre client. Un compte s'active désormais en confirmant
 * son email (lien reçu par email, cf. `/api/fidelite/activer` et `/fidelite/confirmer`).
 */
export async function POST() {
  return NextResponse.json({ error: "Cette page n'existe plus : scanne le QR de ton ticket pour activer ton compte." }, { status: 410 });
}
