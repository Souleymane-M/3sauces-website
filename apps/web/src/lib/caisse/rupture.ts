import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";

/**
 * Rupture rapide d'un produit pour AUJOURD'HUI uniquement — accessible à
 * tout employé connecté (pas besoin du rôle métier "produits", réservé aux
 * actions permanentes du catalogue) : marquer/démarquer une rupture est
 * sans risque, entièrement réversible et se réinitialise tout seul le
 * lendemain (cf. migration rupture_du_jour). Demande explicite du patron,
 * 2026-10-24.
 */
export async function basculerRuptureProduit(produitId: string, enRupture: boolean): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("produits")
    .update({ rupture_le: enRupture ? dateMayotteIso() : null })
    .eq("id", produitId);

  if (error) {
    throw new Error(`Impossible de mettre à jour la rupture : ${error.message}`);
  }
}
