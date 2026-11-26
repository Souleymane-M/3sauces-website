import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { variantesTelephone } from "@/lib/telephone";

/**
 * Numéro sous lequel un client est ENREGISTRÉ. Le même numéro métropolitain a pu être créé en +262 (ancienne règle : tout
 * numéro local était en +262) ou en +33 (règle actuelle) : on retrouve la fiche existante quelle que soit l'écriture, pour que
 * le client ne perde jamais ses points de fidélité. Aucune fiche : le numéro normalisé tel quel (règle de préfixe de
 * `normaliserTelephone`). Les deux écritures existent (doublon) : celle saisie.
 */
export async function resoudreTelephoneClient(supabase: ReturnType<typeof createServiceSupabaseClient>, telephone: string): Promise<string> {
  const variantes = variantesTelephone(telephone);
  if (variantes.length === 1) return telephone;
  const { data } = await supabase.from("clients").select("telephone").in("telephone", variantes);
  const trouves = new Set((data ?? []).map((c) => c.telephone));
  if (trouves.has(telephone)) return telephone;
  return variantes.find((v) => trouves.has(v)) ?? telephone;
}
