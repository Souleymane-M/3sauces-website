import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { chargerEtatSuivi } from "@/lib/suivi/etat";

export async function GET() {
  const session = await requireRoleMetier(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  try {
    return NextResponse.json({ etat: await chargerEtatSuivi() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
