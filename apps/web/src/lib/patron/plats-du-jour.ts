import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

/**
 * Gestion des "Plats du jour" (Page 3 / Module 6) : contrairement à
 * l'ancien produit unique "Plat du jour" (prix libre saisi en caisse), ce
 * sont des produits normaux à prix fixe, plusieurs actifs en même temps,
 * gérés entièrement par le patron sans passer par le code — cf.
 * `categorie = 'plat_du_jour'` sur `produits` (migration
 * 20260906222700_plats_du_jour.sql).
 */
export interface PlatDuJourAdmin {
  id: string;
  nom: string;
  description: string | null;
  prix: number | null;
  actif: boolean;
}

export async function listerPlatsDuJourAdmin(): Promise<PlatDuJourAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("produits")
    .select("id, nom, description, prix, actif")
    .eq("categorie", "plat_du_jour")
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les plats du jour : ${error.message}`);
  }
  return data ?? [];
}

export async function creerPlatDuJour(input: {
  nom: string;
  description: string | null;
  prix: number;
}): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("produits").insert({
    nom: input.nom,
    categorie: "plat_du_jour",
    description: input.description,
    prix: input.prix,
    actif: true,
  });

  if (error) {
    throw new Error(`Impossible de créer le plat : ${error.message}`);
  }
}

export async function mettreAJourPlatDuJour(
  id: string,
  input: { nom?: string; description?: string | null; prix?: number; actif?: boolean }
): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("produits").update(input).eq("id", id).eq("categorie", "plat_du_jour");

  if (error) {
    throw new Error(`Impossible de mettre à jour le plat : ${error.message}`);
  }
}

export async function supprimerPlatDuJour(id: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("produits").delete().eq("id", id).eq("categorie", "plat_du_jour");

  if (error) {
    throw new Error(`Impossible de supprimer le plat : ${error.message}`);
  }
}
