import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { compterLivraisonsParCreneau } from "@/lib/commande-publique/compteur-creneaux";

export const dynamic = "force-dynamic";

/** Nombre de livraisons du jour par lieu et par créneau (caisse et /patron). */
export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  try {
    return NextResponse.json({ lignes: await compterLivraisonsParCreneau() });
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
