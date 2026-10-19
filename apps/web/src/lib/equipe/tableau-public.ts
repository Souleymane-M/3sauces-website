import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { StatutCommande } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import { STATUTS_TERMINAUX } from "@/lib/cuisine/types";

/**
 * Plateau de commandes affiché en permanence, SANS connexion (tablette
 * cuisine/comptoir toujours allumée) — demande explicite du patron,
 * 2026-10-19 : aucun nom, téléphone, adresse ni prix, seulement de quoi
 * suivre l'activité au global. Les montants et le statut payé/à encaisser
 * restent réservés à la vue comptoir, derrière PIN.
 */
export interface CommandeTableauPublic {
  numero: number;
  statut: StatutCommande;
  lignes: LigneCommande[];
  heureSouhaitee: string | null;
}

const SELECT_TABLEAU_PUBLIC = "numero, statut, contenu, heure_souhaitee, created_at, mode_paiement, paiement_statut";

export async function listerTableauPublic(): Promise<CommandeTableauPublic[]> {
  const supabase = createServiceSupabaseClient();
  const { fin } = plageJourMayotteUtc(dateMayotteIso());

  // Même filtre que `listerCommandesActives` (actif, pas une commande à
  // l'avance, pas une commande Stripe pas encore payée) : le plateau public
  // montre la même réalité opérationnelle, juste avec moins de champs.
  const { data, error } = await supabase
    .from("commandes")
    .select(SELECT_TABLEAU_PUBLIC)
    .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .lt("heure_souhaitee", fin.toISOString())
    .order("heure_souhaitee", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger le plateau : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    numero: c.numero,
    statut: c.statut,
    lignes: Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : [],
    heureSouhaitee: c.heure_souhaitee,
  }));
}
