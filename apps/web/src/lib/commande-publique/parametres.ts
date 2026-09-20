import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ParametresLivraisonPublic } from "./types";
import { dateMayotteIso } from "./creneau";
import { remiseLancementActive } from "./remise-lancement";

/**
 * Paramètres de livraison (créneaux, minimum de commande, zones autorisées),
 * lus dynamiquement en base — jamais codés en dur côté app, pour que le
 * patron puisse ajuster zones/horaires/minimum sans déploiement.
 */
export async function chargerParametresLivraisonPublics(): Promise<ParametresLivraisonPublic> {
  const supabase = createServiceSupabaseClient();

  const [{ data: parametres, error: erreurParametres }, { data: zones, error: erreurZones }] =
    await Promise.all([
      supabase
        .from("parametres_livraison")
        .select(
          "heure_debut, heure_fin, minimum_commande, site_ouvert, jours_fermeture, remise_lancement_debut, remise_lancement_fin"
        )
        .eq("id", true)
        .single(),
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

  const remiseActive = remiseLancementActive(
    parametres.remise_lancement_debut,
    parametres.remise_lancement_fin,
    dateMayotteIso()
  );

  return {
    heureDebut: parametres.heure_debut,
    heureFin: parametres.heure_fin,
    minimumCommande: parametres.minimum_commande,
    zonesActives: (zones ?? []).map((z) => z.commune),
    siteOuvert: parametres.site_ouvert,
    joursFermeture: parametres.jours_fermeture,
    remiseLancementActive: remiseActive,
    remiseLancementFinLibelle: remiseActive
      ? new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long" }).format(
          new Date(`${parametres.remise_lancement_fin}T12:00:00Z`)
        )
      : null,
  };
}
