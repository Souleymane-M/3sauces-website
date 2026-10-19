import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

/**
 * Lit un seuil paramétrable depuis la table générique `parametres`
 * (cle/valeur jsonb) — pensée pour que le Pilotage modifie ces valeurs sans
 * repasser par un développeur. `defaut` protège contre une ligne absente
 * (ex: migration pas encore appliquée sur cet environnement).
 */
export async function chargerSeuil(cle: string, defaut: number): Promise<number> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("parametres").select("valeur").eq("cle", cle).maybeSingle();
  if (error || !data) return defaut;
  const valeur = Number(data.valeur);
  return Number.isFinite(valeur) ? valeur : defaut;
}
