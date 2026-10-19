import { NextResponse } from "next/server";
import type { Canal } from "@3sauces/supabase";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import {
  calculerStatistiquesDurees,
  calculerSeuilDeuxiemeLivreur,
  calculerRepartitionMotifs,
} from "@/lib/patron/statistiques-equipe";

const CANAUX_VALIDES: Canal[] = ["sur_place", "emporter", "livraison", "en_ligne"];

export async function GET(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const canalParam = new URL(request.url).searchParams.get("canal");
  const canal = canalParam && CANAUX_VALIDES.includes(canalParam as Canal) ? (canalParam as Canal) : undefined;

  const aujourdhui = dateMayotteIso();

  try {
    const [jour, semaine, seuilDeuxiemeLivreur, motifs] = await Promise.all([
      calculerStatistiquesDurees(aujourdhui, aujourdhui, canal),
      calculerStatistiquesDurees(lundiDeLaSemaineCourante(), aujourdhui, canal),
      calculerSeuilDeuxiemeLivreur(),
      calculerRepartitionMotifs(lundiDeLaSemaineCourante(), aujourdhui),
    ]);
    return NextResponse.json({ jour, semaine, seuilDeuxiemeLivreur, motifs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function lundiDeLaSemaineCourante(): string {
  const aujourdhui = dateMayotteIso();
  const [a, m, j] = aujourdhui.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const jourSemaine = d.getUTCDay();
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}
