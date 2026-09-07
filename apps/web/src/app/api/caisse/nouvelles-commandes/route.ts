import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerNouvellesCommandesPubliques } from "@/lib/caisse/nouvelles-commandes";

export async function GET(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const depuis = searchParams.get("depuis");

  try {
    const resultat = await listerNouvellesCommandesPubliques(depuis);
    return NextResponse.json(resultat);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
