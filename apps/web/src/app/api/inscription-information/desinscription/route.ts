import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { jetonValide } from "@/lib/inscription-information";

/** Désinscription en un clic via le jeton propre à chaque inscrit (lien présent dans chaque email envoyé). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jeton?: unknown } | null;
  if (!body || !jetonValide(body.jeton)) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("inscriptions_information")
    .update({ desinscrit_le: new Date().toISOString(), accepte_offres: false })
    .eq("jeton_desinscription", body.jeton);
  if (error) {
    return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
