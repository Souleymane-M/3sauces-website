import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

export interface ClientAdmin {
  telephone: string;
  montantCumule: number;
  tamponsAcquis: number;
  recompenseDisponible: boolean;
  dateExpiration: string | null;
  email: string | null;
}

/**
 * Tous les clients fidélité (table `clients`, créée/mise à jour
 * automatiquement par le trigger DB à chaque paiement — jamais insérée à
 * la main). Triée par montant cumulé décroissant : les clients les plus
 * fidèles en premier, ceux à une récompense près faciles à repérer.
 */
export async function listerClientsAdmin(): Promise<ClientAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("telephone, montant_cumule, tampons_acquis, recompense_disponible, date_expiration, email")
    .order("montant_cumule", { ascending: false });

  if (error) {
    throw new Error(`Impossible de charger les clients : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    telephone: c.telephone,
    montantCumule: c.montant_cumule,
    tamponsAcquis: c.tampons_acquis,
    recompenseDisponible: c.recompense_disponible,
    dateExpiration: c.date_expiration,
    email: c.email,
  }));
}
