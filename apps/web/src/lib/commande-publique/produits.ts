import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ProduitPublic, ViandePublique } from "./types";

/**
 * Carte publique (site de commande en ligne, client anonyme).
 *
 * Contrairement à `caisse/produits.ts` :
 *  - jamais de `cout_matiere` / `est_desactivable` (données internes) ;
 *  - les produits à prix libre (`prix IS NULL`, plat du jour) sont exclus —
 *    voir la justification dans `./types.ts`.
 */
export async function listerProduitsPublics(): Promise<ProduitPublic[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("produits")
    .select("id, nom, categorie, prix, description, nb_viandes_max")
    .eq("actif", true)
    .not("prix", "is", null)
    .order("categorie", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger la carte : ${error.message}`);
  }

  return (data ?? [])
    .filter((p): p is typeof p & { prix: number } => p.prix !== null)
    .map((p) => ({
      id: p.id,
      nom: p.nom,
      categorie: p.categorie,
      prix: p.prix,
      description: p.description,
      nbViandesMax: p.nb_viandes_max,
    }));
}

export async function listerViandesPubliques(): Promise<ViandePublique[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("viandes")
    .select("id, nom")
    .eq("actif", true)
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les viandes : ${error.message}`);
  }

  return data ?? [];
}
