import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { ajouterJoursIso, dateMayotteIso } from "@/lib/commande-publique/creneau";
import { DELAI_EN_LIGNE_SEC, TYPES_EVENEMENT, type EtapeVisiteur, type EtatSuivi, type TypeEvenement } from "./types";

function compteurVide(): Record<TypeEvenement, number> {
  return Object.fromEntries(TYPES_EVENEMENT.map((t) => [t, 0])) as Record<TypeEvenement, number>;
}

export async function chargerEtatSuivi(): Promise<EtatSuivi> {
  const supabase = createServiceSupabaseClient();
  const aujourdHui = dateMayotteIso();
  const hier = ajouterJoursIso(aujourdHui, -1);
  const maintenant = Date.now();

  const [presence, evenements] = await Promise.all([
    supabase
      .from("visiteurs_site")
      .select("etape, premiere_vue")
      .gte("derniere_activite", new Date(maintenant - DELAI_EN_LIGNE_SEC * 1000).toISOString())
      .order("premiere_vue", { ascending: true }),
    supabase.from("evenements_site").select("type, produit, date_jour").in("date_jour", [aujourdHui, hier]),
  ]);
  if (presence.error) throw new Error(presence.error.message);
  if (evenements.error) throw new Error(evenements.error.message);

  const entonnoir = { aujourdhui: compteurVide(), hier: compteurVide() };
  const parProduit = new Map<string, number>();
  for (const e of evenements.data ?? []) {
    const jour = e.date_jour === aujourdHui ? entonnoir.aujourdhui : entonnoir.hier;
    jour[e.type] += 1;
    if (e.type === "produit_ajoute" && e.date_jour === aujourdHui && e.produit) {
      parProduit.set(e.produit, (parProduit.get(e.produit) ?? 0) + 1);
    }
  }
  // "produit_ajoute" sert uniquement au classement, pas à l'entonnoir.
  entonnoir.aujourdhui.produit_ajoute = 0;
  entonnoir.hier.produit_ajoute = 0;

  return {
    enLigne: (presence.data ?? []).map((v) => ({
      etape: v.etape as EtapeVisiteur,
      depuisSec: Math.max(0, Math.round((maintenant - new Date(v.premiere_vue).getTime()) / 1000)),
    })),
    entonnoir,
    topProduits: [...parProduit.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([produit, visiteurs]) => ({ produit, visiteurs })),
  };
}
