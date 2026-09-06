import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Categorie } from "@3sauces/supabase";
import type { ProduitAdmin, ProduitAdminInput, ProduitAdminPatch } from "./produits-types";

/**
 * Gestion complète de la carte (Page 3 / Module 6) : contrairement aux
 * migrations SQL utilisées jusqu'ici, le patron peut désormais créer,
 * modifier, activer/désactiver et supprimer n'importe quel produit de
 * n'importe quelle catégorie sans toucher au code — cf.
 * ProduitPublic/listerProduitsPublics qui lit exactement les mêmes colonnes
 * côté site public.
 *
 * `prix` reste `number | null` : un prix vide correspond à un produit à
 * prix libre (ex: l'ancien "Plat du jour" en catégorie cuisine_locale,
 * saisi manuellement en caisse) — le site public l'exclut déjà
 * automatiquement (`.not("prix", "is", null)`), aucune règle spéciale à
 * ajouter ici.
 */
const SELECT_ADMIN =
  "id, nom, categorie, description, prix, actif, nb_viandes_max, viande_imposee, nb_sauces_incluses, autorise_extras, nb_saveurs_max, canette_incluse";

function versProduitAdmin(p: {
  id: string;
  nom: string;
  categorie: Categorie;
  description: string | null;
  prix: number | null;
  actif: boolean;
  nb_viandes_max: number;
  viande_imposee: string | null;
  nb_sauces_incluses: number;
  autorise_extras: boolean;
  nb_saveurs_max: number;
  canette_incluse: boolean;
}): ProduitAdmin {
  return {
    id: p.id,
    nom: p.nom,
    categorie: p.categorie,
    description: p.description,
    prix: p.prix,
    actif: p.actif,
    nbViandesMax: p.nb_viandes_max,
    viandeImposee: p.viande_imposee,
    nbSaucesIncluses: p.nb_sauces_incluses,
    autoriseExtras: p.autorise_extras,
    nbSaveursMax: p.nb_saveurs_max,
    canetteIncluse: p.canette_incluse,
  };
}

export async function listerProduitsAdmin(): Promise<ProduitAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("produits")
    .select(SELECT_ADMIN)
    .order("categorie", { ascending: true })
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les produits : ${error.message}`);
  }
  return (data ?? []).map(versProduitAdmin);
}

export async function creerProduit(input: ProduitAdminInput): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("produits").insert({
    nom: input.nom,
    categorie: input.categorie,
    description: input.description,
    prix: input.prix,
    actif: true,
    nb_viandes_max: input.nbViandesMax ?? 0,
    viande_imposee: input.viandeImposee ?? null,
    nb_sauces_incluses: input.nbSaucesIncluses ?? 0,
    autorise_extras: input.autoriseExtras ?? false,
    nb_saveurs_max: input.nbSaveursMax ?? 0,
    canette_incluse: input.canetteIncluse ?? false,
  });

  if (error) {
    throw new Error(`Impossible de créer le produit : ${error.message}`);
  }
}

export async function mettreAJourProduit(id: string, input: ProduitAdminPatch): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const update: {
    nom?: string;
    categorie?: Categorie;
    description?: string | null;
    prix?: number | null;
    actif?: boolean;
    nb_viandes_max?: number;
    viande_imposee?: string | null;
    nb_sauces_incluses?: number;
    autorise_extras?: boolean;
    nb_saveurs_max?: number;
    canette_incluse?: boolean;
  } = {};
  if (input.nom !== undefined) update.nom = input.nom;
  if (input.categorie !== undefined) update.categorie = input.categorie;
  if (input.description !== undefined) update.description = input.description;
  if (input.prix !== undefined) update.prix = input.prix;
  if (input.actif !== undefined) update.actif = input.actif;
  if (input.nbViandesMax !== undefined) update.nb_viandes_max = input.nbViandesMax;
  if (input.viandeImposee !== undefined) update.viande_imposee = input.viandeImposee;
  if (input.nbSaucesIncluses !== undefined) update.nb_sauces_incluses = input.nbSaucesIncluses;
  if (input.autoriseExtras !== undefined) update.autorise_extras = input.autoriseExtras;
  if (input.nbSaveursMax !== undefined) update.nb_saveurs_max = input.nbSaveursMax;
  if (input.canetteIncluse !== undefined) update.canette_incluse = input.canetteIncluse;

  const { error } = await supabase.from("produits").update(update).eq("id", id);

  if (error) {
    throw new Error(`Impossible de mettre à jour le produit : ${error.message}`);
  }
}

export async function supprimerProduit(id: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("produits").delete().eq("id", id);

  if (error) {
    throw new Error(`Impossible de supprimer le produit : ${error.message}`);
  }
}
