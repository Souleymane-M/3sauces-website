import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerLivraisonsAssignees } from "@/lib/livreur/commandes";

export async function GET() {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const livraisons = await listerLivraisonsAssignees(session.profilId);
    return NextResponse.json({ livraisons });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
