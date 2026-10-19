import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { RoleMetier } from "@3sauces/supabase";

export type { RoleMetier };

/**
 * Rôles métier d'un profil (ce qu'il a le droit de voir/faire), distincts
 * du type de compte (`profils.role`, qui ne détermine que le mécanisme de
 * connexion). Un profil "employe" peut cumuler cuisine et comptoir.
 */
export async function chargerRolesMetier(profilId: string): Promise<RoleMetier[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("profil_roles").select("role_metier").eq("profil_id", profilId);
  if (error) {
    throw new Error(`Impossible de charger les rôles métier : ${error.message}`);
  }
  return (data ?? []).map((r) => r.role_metier);
}
