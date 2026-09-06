import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ProduitPublic, ViandePublique, SaucePublique, SaveurPublique } from "./types";

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
    .select(
      "id, nom, categorie, prix, description, nb_viandes_max, viande_imposee, nb_sauces_incluses, autorise_extras, nb_saveurs_max"
    )
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
      viandeImposee: p.viande_imposee,
      nbSaucesIncluses: p.nb_sauces_incluses,
      autoriseExtras: p.autorise_extras,
      nbSaveursMax: p.nb_saveurs_max,
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

export async function listerSaucesPubliques(): Promise<SaucePublique[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("sauces")
    .select("id, nom")
    .eq("actif", true)
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les sauces : ${error.message}`);
  }

  return data ?? [];
}

export async function listerSaveursPubliques(): Promise<SaveurPublique[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("saveurs")
    .select("id, nom")
    .eq("actif", true)
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les saveurs : ${error.message}`);
  }

  return data ?? [];
}
