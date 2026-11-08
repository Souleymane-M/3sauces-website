import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { chargerDonneesDepenses, moisCourantMayotte, moisValide } from "@/lib/patron/depenses";
import { CATEGORIES_DEPENSE, MODES_PAIEMENT_DEPENSE, type LigneDepense } from "@/lib/depenses-categories";
import { dateIsoValide } from "@/lib/commande-publique/creneau";

interface CorpsDepense {
  id?: string;
  dateDepense?: string;
  fournisseur?: string | null;
  description?: string | null;
  categorie?: string;
  montant?: number;
  modePaiement?: string | null;
  lignes?: LigneDepense[];
  factureChemin?: string | null;
  factureType?: string | null;
}

const texte = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function nettoyerLignes(brut: unknown): LigneDepense[] | null {
  if (!Array.isArray(brut) || brut.length > 200) return null;
  const lignes: LigneDepense[] = [];
  for (const l of brut) {
    const designation = texte(l?.designation, 200);
    const montant = nombre(l?.montant);
    if (!designation || montant === null) continue;
    lignes.push({ designation, quantite: nombre(l?.quantite), unite: texte(l?.unite, 20), prixUnitaire: nombre(l?.prixUnitaire), montant });
  }
  return lignes;
}

/** Valide le corps d'une dépense ; renvoie la ligne prête à enregistrer ou un message d'erreur. */
function valider(corps: CorpsDepense) {
  if (!corps.dateDepense || !dateIsoValide(corps.dateDepense)) return { erreur: "Date invalide." };
  if (!CATEGORIES_DEPENSE.some((c) => c.valeur === corps.categorie)) return { erreur: "Catégorie invalide." };
  const montant = nombre(corps.montant);
  if (montant === null || montant < 0 || montant > 1_000_000) return { erreur: "Montant invalide." };
  if (corps.modePaiement && !MODES_PAIEMENT_DEPENSE.some((m) => m.valeur === corps.modePaiement)) return { erreur: "Mode de paiement invalide." };
  const lignes = nettoyerLignes(corps.lignes ?? []);
  if (!lignes) return { erreur: "Lignes invalides." };
  return {
    ligne: {
      date_depense: corps.dateDepense,
      fournisseur: texte(corps.fournisseur, 120),
      description: texte(corps.description, 300),
      categorie: corps.categorie as string,
      montant: Math.round(montant * 100) / 100,
      mode_paiement: corps.modePaiement || null,
      lignes,
    },
  };
}

/** Dépenses d'un mois + résumé (ventes, dépenses, par catégorie) — patron uniquement. */
export async function GET(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const mois = new URL(request.url).searchParams.get("mois") ?? moisCourantMayotte();
  if (!moisValide(mois)) return NextResponse.json({ error: "Mois invalide." }, { status: 400 });
  try {
    return NextResponse.json(await chargerDonneesDepenses(mois));
  } catch {
    return NextResponse.json({ error: "Chargement impossible." }, { status: 500 });
  }
}

/** Enregistre une dépense (avec, éventuellement, la facture déjà envoyée par /extraire). */
export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const corps = (await request.json().catch(() => null)) as CorpsDepense | null;
  if (!corps) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { ligne, erreur } = valider(corps);
  if (!ligne) return NextResponse.json({ error: erreur }, { status: 400 });

  const chemin = texte(corps.factureChemin, 200);
  if (chemin && !/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(chemin)) {
    return NextResponse.json({ error: "Facture invalide." }, { status: 400 });
  }
  const type = chemin ? (chemin.split(".").pop() as string) : null;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("depenses")
    .insert({ ...ligne, facture_chemin: chemin, facture_type: type, saisi_par: session.profilId })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

/** Corrige une dépense existante (la facture jointe ne change pas). */
export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const corps = (await request.json().catch(() => null)) as CorpsDepense | null;
  if (!corps?.id) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { ligne, erreur } = valider(corps);
  if (!ligne) return NextResponse.json({ error: erreur }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("depenses").update(ligne).eq("id", corps.id);
  if (error) return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Supprime une dépense et sa facture. */
export async function DELETE(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("depenses").select("facture_chemin").eq("id", id).maybeSingle();
  const { error } = await supabase.from("depenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  if (data?.facture_chemin) await supabase.storage.from("factures").remove([data.facture_chemin]);
  return NextResponse.json({ ok: true });
}
