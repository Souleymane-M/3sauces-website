import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

/**
 * État "site ouvert/fermé" — table singleton `parametres_livraison`
 * (mêmes conventions que `lib/patron/produits.ts`).
 */
export async function chargerEtatSite(): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("parametres_livraison")
    .select("site_ouvert")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error(`Impossible de charger l'état du site : ${error?.message ?? "introuvable"}`);
  }
  return data.site_ouvert;
}

export async function basculerSiteOuvert(ouvert: boolean): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("parametres_livraison").update({ site_ouvert: ouvert }).eq("id", true);

  if (error) {
    throw new Error(`Impossible de mettre à jour l'état du site : ${error.message}`);
  }
}

/**
 * Jours de fermeture hebdomadaire (0 = dimanche ... 6 = samedi) — distincts
 * de `site_ouvert`, qui coupe tout le site ponctuellement. Ceux-ci ne
 * bloquent jamais l'accès au site : ils ne font que restreindre les dates
 * de retrait proposées sur /commander.
 */
export async function chargerJoursFermeture(): Promise<number[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("parametres_livraison")
    .select("jours_fermeture")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error(`Impossible de charger les jours de fermeture : ${error?.message ?? "introuvable"}`);
  }
  return data.jours_fermeture;
}

export async function definirJoursFermeture(jours: number[]): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("parametres_livraison").update({ jours_fermeture: jours }).eq("id", true);

  if (error) {
    throw new Error(`Impossible de mettre à jour les jours de fermeture : ${error.message}`);
  }
}

/**
 * Dates de l'opération de lancement (-2€ dès 10€, site public uniquement) —
 * nullables : si l'une des deux est absente, la remise est simplement
 * inactive, jamais bloquant.
 */
export async function chargerRemiseLancement(): Promise<{ debut: string | null; fin: string | null }> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("parametres_livraison")
    .select("remise_lancement_debut, remise_lancement_fin")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error(`Impossible de charger la remise de lancement : ${error?.message ?? "introuvable"}`);
  }
  return { debut: data.remise_lancement_debut, fin: data.remise_lancement_fin };
}

export async function definirRemiseLancement(debut: string | null, fin: string | null): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("parametres_livraison")
    .update({ remise_lancement_debut: debut, remise_lancement_fin: fin })
    .eq("id", true);

  if (error) {
    throw new Error(`Impossible de mettre à jour la remise de lancement : ${error.message}`);
  }
}
