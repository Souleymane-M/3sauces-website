import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ProduitCaisse, ViandeCaisse, SauceCaisse, SaveurCaisse } from "./types";

/**
 * Carte + référentiels pour l'écran de prise de commande (Module 1) — mêmes
 * règles/colonnes que le site public (`commande-publique/produits.ts`), plus
 * les champs internes caisse (coût matière, plat du jour, désactivable).
 * Contrairement au site public, les produits à prix libre (`prix IS NULL`)
 * ne sont PAS exclus : la caisse est tenue par un employé de confiance, qui
 * saisit le prix du jour au moment de la vente (cf. QuantiteModalPublique).
 *
 * RLS bloque tout accès anonyme sur ces tables : on doit passer par le client
 * service_role, côté serveur uniquement (Server Component ou route handler).
 */
export async function listerProduitsActifs(): Promise<ProduitCaisse[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("produits")
    .select(
      "id, nom, categorie, prix, description, cout_matiere, canette_incluse, nb_viandes_max, viande_imposee, nb_sauces_incluses, autorise_extras, nb_saveurs_max, est_plat_du_jour, est_desactivable"
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
    description: p.description,
    coutMatiere: p.cout_matiere,
    canetteIncluse: p.canette_incluse,
    nbViandesMax: p.nb_viandes_max,
    viandeImposee: p.viande_imposee,
    nbSaucesIncluses: p.nb_sauces_incluses,
    autoriseExtras: p.autorise_extras,
    nbSaveursMax: p.nb_saveurs_max,
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

export async function listerSaucesActives(): Promise<SauceCaisse[]> {
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

export async function listerSaveursActives(): Promise<SaveurCaisse[]> {
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
