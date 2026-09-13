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
