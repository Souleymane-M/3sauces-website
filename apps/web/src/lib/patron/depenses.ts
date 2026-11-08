import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { construireHeureSouhaiteeUtc, dateMayotteIso } from "@/lib/commande-publique/creneau";
import { CATEGORIES_ACHATS, type LigneDepense } from "@/lib/depenses-categories";

export interface DepenseAdmin {
  id: string;
  dateDepense: string;
  fournisseur: string | null;
  description: string | null;
  categorie: string;
  montant: number;
  modePaiement: string | null;
  lignes: LigneDepense[];
  aFacture: boolean;
}

export interface ResumeMois {
  mois: string;
  ventes: number;
  nbCommandes: number;
  totalDepenses: number;
  totalAchats: number;
  parCategorie: { categorie: string; montant: number }[];
}

export interface DonneesDepenses {
  depenses: DepenseAdmin[];
  resume: ResumeMois;
}

export const moisCourantMayotte = () => dateMayotteIso().slice(0, 7);

export function moisValide(mois: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
}

function moisSuivant(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Dépenses du mois (heure de Mayotte) et résumé : ventes encaissées, dépenses, par catégorie. */
export async function chargerDonneesDepenses(mois: string = moisCourantMayotte()): Promise<DonneesDepenses> {
  const supabase = createServiceSupabaseClient();
  const debutJour = `${mois}-01`;
  const finJour = `${moisSuivant(mois)}-01`;

  const { data, error } = await supabase
    .from("depenses")
    .select("id, date_depense, fournisseur, description, categorie, montant, mode_paiement, lignes, facture_chemin")
    .gte("date_depense", debutJour)
    .lt("date_depense", finJour)
    .order("date_depense", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Impossible de charger les dépenses : ${error.message}`);

  const depenses: DepenseAdmin[] = (data ?? []).map((d) => ({
    id: d.id,
    dateDepense: d.date_depense,
    fournisseur: d.fournisseur,
    description: d.description,
    categorie: d.categorie,
    montant: Number(d.montant),
    modePaiement: d.mode_paiement,
    lignes: Array.isArray(d.lignes) ? (d.lignes as LigneDepense[]) : [],
    aFacture: !!d.facture_chemin,
  }));

  // Ventes encaissées du mois (commandes payées, hors annulées), par pages de 1000.
  const debut = construireHeureSouhaiteeUtc("00:00", debutJour)!.toISOString();
  const fin = construireHeureSouhaiteeUtc("00:00", finJour)!.toISOString();
  let ventes = 0;
  let nbCommandes = 0;
  for (let decalage = 0; ; decalage += 1000) {
    const { data: commandes, error: erreurCommandes } = await supabase
      .from("commandes")
      .select("montant")
      .eq("paiement_statut", "paye")
      .neq("statut", "annulee")
      .gte("created_at", debut)
      .lt("created_at", fin)
      .order("created_at", { ascending: true })
      .range(decalage, decalage + 999);
    if (erreurCommandes) throw new Error(`Impossible de charger les ventes : ${erreurCommandes.message}`);
    for (const c of commandes ?? []) ventes += Number(c.montant);
    nbCommandes += commandes?.length ?? 0;
    if ((commandes?.length ?? 0) < 1000) break;
  }

  const parCategorieMap = new Map<string, number>();
  for (const d of depenses) parCategorieMap.set(d.categorie, (parCategorieMap.get(d.categorie) ?? 0) + d.montant);
  const parCategorie = [...parCategorieMap]
    .map(([categorie, montant]) => ({ categorie, montant: arrondi(montant) }))
    .sort((a, b) => b.montant - a.montant);

  return {
    depenses,
    resume: {
      mois,
      ventes: arrondi(ventes),
      nbCommandes,
      totalDepenses: arrondi(depenses.reduce((t, d) => t + d.montant, 0)),
      totalAchats: arrondi(depenses.filter((d) => (CATEGORIES_ACHATS as string[]).includes(d.categorie)).reduce((t, d) => t + d.montant, 0)),
      parCategorie,
    },
  };
}
