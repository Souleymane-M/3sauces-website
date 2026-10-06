import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@3sauces/supabase";
import type { SoldeTampons } from "./regles";

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
