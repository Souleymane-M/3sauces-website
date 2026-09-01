import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ParametresLivraisonPublic } from "./types";

/**
 * Paramètres de livraison (créneaux, minimum de commande, zones autorisées),
 * lus dynamiquement en base — jamais codés en dur côté app, pour que le
 * patron puisse ajuster zones/horaires/minimum sans déploiement.
 */
export async function chargerParametresLivraisonPublics(): Promise<ParametresLivraisonPublic> {
  const supabase = createServiceSupabaseClient();

  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] =
    await Promise.all([
      supabase.from("parametres_livraison").select("heure_debut, heure_fin, minimum_commande").eq("id", true).single(),
      supabase.from("zones_livraison").select("commune").eq("actif", true),
    ]);

  if (erreurParametres || !parametres) {
    throw new Error(
      `Impossible de charger les paramètres de livraison : ${erreurParametres?.message ?? "introuvable"}`
    );
  }
  if (erreurZones) {
    throw new Error(`Impossible de charger les zones de livraison : ${erreurZones.message}`);
  }

  return {
    heureDebut: parametres.heure_debut,
    heureFin: parametres.heure_fin,
    minimumCommande: parametres.minimum_commande,
    zonesActives: (zones ?? []).map((z) => z.commune),
  };
}
