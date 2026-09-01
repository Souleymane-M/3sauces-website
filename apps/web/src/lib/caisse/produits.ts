import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ProduitCaisse, ViandeCaisse } from "./types";

/**
 * Carte + référentiel viandes pour l'écran de prise de commande.
 * RLS bloque tout accès anonyme sur ces tables : on doit passer par le client
 * service_role, côté serveur uniquement (Server Component ou route handler).
 */
export async function listerProduitsActifs(): Promise<ProduitCaisse[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("produits")
    .select(
      "id, nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, est_plat_du_jour, est_desactivable"
    )
    .eq("actif", true)
    .order("categorie", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger la carte : ${error.message}`);
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    categorie: p.categorie,
    prix: p.prix,
    coutMatiere: p.cout_matiere,
    canetteIncluse: p.canette_incluse,
    nbViandesMax: p.nb_viandes_max,
    estPlatDuJour: p.est_plat_du_jour,
    estDesactivable: p.est_desactivable,
  }));
}

export async function listerViandesActives(): Promise<ViandeCaisse[]> {
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
