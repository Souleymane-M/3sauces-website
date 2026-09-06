import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { TypeOption, OptionAdmin } from "./options-types";

/**
 * Gestion des 3 référentiels d'options (Page 3 / Module 6) : viandes,
 * sauces, saveurs — chacun référencé par nom depuis `produits` dans le
 * configurateur public.
 *
 * Écrit en branches explicites par table plutôt qu'en code générique
 * paramétré par nom de table : Supabase génère un type très strict par
 * table (ex: `viandes` exige `unite_deduction`, absent de `sauces`/
 * `saveurs`), et un wrapper générique unique casse cette vérification de
 * type à la compilation sans réel gain de lisibilité vu qu'il n'y a que
 * 3 tables.
 */
export async function listerOptionsAdmin(type: TypeOption): Promise<OptionAdmin[]> {
  const supabase = createServiceSupabaseClient();

  if (type === "viandes") {
    const { data, error } = await supabase
      .from("viandes")
      .select("id, nom, actif, unite_deduction")
      .order("nom", { ascending: true });
    if (error) throw new Error(`Impossible de charger les viandes : ${error.message}`);
    return (data ?? []).map((o) => ({ id: o.id, nom: o.nom, actif: o.actif, uniteDeduction: o.unite_deduction }));
  }

  if (type === "sauces") {
    const { data, error } = await supabase.from("sauces").select("id, nom, actif").order("nom", { ascending: true });
    if (error) throw new Error(`Impossible de charger les sauces : ${error.message}`);
    return data ?? [];
  }

  const { data, error } = await supabase.from("saveurs").select("id, nom, actif").order("nom", { ascending: true });
  if (error) throw new Error(`Impossible de charger les saveurs : ${error.message}`);
  return data ?? [];
}

export async function creerOption(
  type: TypeOption,
  input: { nom: string; uniteDeduction?: "grammes" | "pieces" }
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  if (type === "viandes") {
    const { error } = await supabase
      .from("viandes")
      .insert({ nom: input.nom, actif: true, unite_deduction: input.uniteDeduction ?? "pieces" });
    if (error) throw new Error(`Impossible de créer : ${error.message}`);
    return;
  }

  const table = type === "sauces" ? "sauces" : "saveurs";
  const { error } = await supabase.from(table).insert({ nom: input.nom, actif: true });
  if (error) throw new Error(`Impossible de créer : ${error.message}`);
}

export async function mettreAJourOption(
  type: TypeOption,
  id: string,
  input: { nom?: string; actif?: boolean; uniteDeduction?: "grammes" | "pieces" }
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  if (type === "viandes") {
    const update: { nom?: string; actif?: boolean; unite_deduction?: "grammes" | "pieces" } = {};
    if (input.nom !== undefined) update.nom = input.nom;
    if (input.actif !== undefined) update.actif = input.actif;
    if (input.uniteDeduction !== undefined) update.unite_deduction = input.uniteDeduction;
    const { error } = await supabase.from("viandes").update(update).eq("id", id);
    if (error) throw new Error(`Impossible de mettre à jour : ${error.message}`);
    return;
  }

  const update: { nom?: string; actif?: boolean } = {};
  if (input.nom !== undefined) update.nom = input.nom;
  if (input.actif !== undefined) update.actif = input.actif;
  const table = type === "sauces" ? "sauces" : "saveurs";
  const { error } = await supabase.from(table).update(update).eq("id", id);
  if (error) throw new Error(`Impossible de mettre à jour : ${error.message}`);
}

export async function supprimerOption(type: TypeOption, id: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const table = type === "viandes" ? "viandes" : type === "sauces" ? "sauces" : "saveurs";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(`Impossible de supprimer : ${error.message}`);
}
