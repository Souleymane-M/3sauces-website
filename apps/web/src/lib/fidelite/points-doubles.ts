import "server-only";
import type { createServiceSupabaseClient } from "@3sauces/supabase";

import { JOURS_POINTS_DOUBLES_ACTIFS, pointsDoublesPossibles } from "@/lib/fidelite/jours-points-doubles";

export { JOURS_POINTS_DOUBLES_ACTIFS, pointsDoublesPossibles };

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

/** Vrai si la commande du site qui va être créée doit recevoir les points doublés (tous les clients, le jour de l'opération). Jamais bloquant : toute erreur = faux. */
export async function pointsDoublesApplicables(supabase: Supabase, telephone: string | null, dateService: string): Promise<boolean> {
  if (!telephone || !pointsDoublesPossibles(dateService)) return false;
  try {
    // Tant que la migration « points_doubles » n'est pas passée dans Supabase, la colonne n'existe pas : on n'applique rien.
    const colonne = await supabase.from("commandes").select("points_doubles" as never).limit(1);
    if (colonne.error) return false;
    // Pour TOUS les clients, anciens et nouveaux (décision du patron, 2026-11-20) : plus de condition d'ancienneté ni d'activité.
    return true;
  } catch {
    return false;
  }
}
