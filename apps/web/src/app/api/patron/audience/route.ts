import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { chargerAudience } from "@/lib/suivi/audience";
import type { PeriodeAudience } from "@/lib/suivi/audience-types";

export async function GET(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const p = new URL(request.url).searchParams.get("periode");
  const periode: PeriodeAudience = p === "7j" || p === "30j" ? p : "aujourdhui";
  try {
    return NextResponse.json({ etat: await chargerAudience(periode) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
