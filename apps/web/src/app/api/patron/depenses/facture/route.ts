import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";

/** Ouvre la facture d'une dépense via un lien temporaire (5 minutes) — patron uniquement. */
export async function GET(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("depenses").select("facture_chemin").eq("id", id).maybeSingle();
  if (!data?.facture_chemin) return NextResponse.json({ error: "Pas de facture." }, { status: 404 });
  const { data: lien } = await supabase.storage.from("factures").createSignedUrl(data.facture_chemin, 300);
  if (!lien?.signedUrl) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  return NextResponse.redirect(lien.signedUrl);
}
