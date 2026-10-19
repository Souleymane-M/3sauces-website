import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRoleMetier } from "@/lib/auth/get-session";

const CLES_AUTORISEES = [
  "delai_preparation_standard_min",
  "seuil_alerte_retard_etape_min",
  "seuil_retard_2e_livreur_min",
  "duree_verrouillage_appareil_sec",
  "seuil_tentatives_appareil_partage",
  "seuil_tentatives_appareil_livreur",
  "seuil_tentatives_ip_horaire",
];

export async function GET() {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("parametres").select("cle, valeur, description").in("cle", CLES_AUTORISEES);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ parametres: data ?? [] });
}

export async function PATCH(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { cle?: string; valeur?: number } | null;
  if (!body?.cle || !CLES_AUTORISEES.includes(body.cle) || typeof body.valeur !== "number" || !Number.isFinite(body.valeur)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("parametres").update({ valeur: body.valeur }).eq("cle", body.cle);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
