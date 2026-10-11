import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@3sauces/supabase";
import type { SoldeTampons } from "./regles";
import { progressionTampons } from "./regles";

/**
 * Solde de tampons disponibles pour un client — un tampon "disponible" se
 * calcule à la lecture (`not utilise and date_expiration > now()`), jamais
 * par un job planifié qui les ferait "expirer" activement. Source unique
 * réutilisée par /api/caisse/clients, /api/fidelite/solde, /patron et les
 * emails, pour ne jamais avoir deux endroits qui comptent différemment.
 */
export async function compterTamponsDisponibles(
  supabase: SupabaseClient<Database>,
  telephone: string
): Promise<SoldeTampons> {
  const { data, error } = await supabase
    .from("fidelite_tampons")
    .select("date_expiration")
    .eq("client_telephone", telephone)
    .eq("utilise", false)
    .gt("date_expiration", new Date().toISOString())
    .order("date_expiration", { ascending: true });

  if (error) {
    console.error("[fidelite/tampons] échec lecture tampons disponibles :", error.message);
    return { nombre: 0, prochaineExpiration: null };
  }

  return {
    nombre: data?.length ?? 0,
    prochaineExpiration: data?.[0]?.date_expiration ?? null,
  };
}

/**
 * Nombre de tampons à AFFICHER pour un client (0-10, ou plus si plusieurs
 * récompenses pas encore utilisées) — pas le nombre de récompenses
 * (`SoldeTampons.nombre`, qui vaut des groupes de 10). Utilisé pour
 * l'impression du ticket, où le patron a explicitement demandé de
 * n'afficher QUE ce nombre de tampons, jamais de montant restant.
 */
export async function calculerTamponsPourTicket(
  supabase: SupabaseClient<Database>,
  telephone: string
): Promise<{ tampons: number; recompenseDisponible: boolean }> {
  const [solde, { data: clientRow }] = await Promise.all([
    compterTamponsDisponibles(supabase, telephone),
    supabase.from("clients").select("montant_cumule").eq("telephone", telephone).maybeSingle(),
  ]);
  const reliquat = clientRow?.montant_cumule ?? 0;
  return {
    tampons: progressionTampons(reliquat, solde.nombre),
    recompenseDisponible: solde.nombre > 0,
  };
}
