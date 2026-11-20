import "server-only";
import type { createServiceSupabaseClient } from "@3sauces/supabase";

import { JOURS_POINTS_DOUBLES_ACTIFS, pointsDoublesPossibles } from "@/lib/fidelite/jours-points-doubles";

export { JOURS_POINTS_DOUBLES_ACTIFS, pointsDoublesPossibles };
const JOURS_CLIENT_ACTIF = 14;

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

/** Vrai si la commande qui va être créée pour ce numéro doit recevoir les points doublés. Jamais bloquant : toute erreur = faux. */
export async function pointsDoublesApplicables(supabase: Supabase, telephone: string | null, dateService: string): Promise<boolean> {
  if (!telephone || !pointsDoublesPossibles(dateService)) return false;
  try {
    // Tant que la migration « points_doubles » n'est pas passée dans Supabase, la colonne n'existe pas : on n'applique rien.
    const colonne = await supabase.from("commandes").select("points_doubles" as never).limit(1);
    if (colonne.error) return false;
    const { data, error } = await supabase
      .from("commandes")
      .select("created_at")
      .eq("client_telephone", telephone)
      .neq("statut", "annulee")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error || !data || data.length < 2) return false;
    const jours = (Date.now() - new Date(data[0].created_at).getTime()) / 86_400_000;
    return jours < JOURS_CLIENT_ACTIF;
  } catch {
    return false;
  }
}
