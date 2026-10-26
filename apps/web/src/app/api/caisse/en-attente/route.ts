import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAILLE_MAX_CONTENU = 200_000;

async function listerContenus() {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes_en_attente_caisse")
    .select("contenu")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => l.contenu);
}

// Liste partagée par tous les appareils de la caisse.
export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  try {
    return NextResponse.json({ commandes: await listerContenus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_CONTENU) return NextResponse.json({ error: "Commande trop volumineuse." }, { status: 413 });
  let contenu: unknown;
  try {
    contenu = JSON.parse(texte);
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const c = contenu as { id?: unknown } | null;
  if (!c || typeof c !== "object" || typeof c.id !== "string" || !UUID.test(c.id)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  try {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
      .from("commandes_en_attente_caisse")
      .upsert({ id: c.id, contenu: c as Record<string, unknown>, cree_par: session.profilId });
    if (error) throw new Error(error.message);
    return NextResponse.json({ commandes: await listerContenus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}

// Retire une commande (reprise ou suppression). `supprimee` vaut false si un
// autre appareil l'a déjà reprise : un seul appareil peut la récupérer.
export async function DELETE(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase.from("commandes_en_attente_caisse").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ supprimee: (data ?? []).length > 0, commandes: await listerContenus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
