import type { Canal, StatutCommande } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";

/**
 * Commande affichée sur /commandes (écran cuisine) : jamais de prix, de
 * mode de paiement ni de statistiques — cf. cahier des charges "ce qui
 * n'apparaît pas sur /commandes".
 */
export interface CommandeCuisine {
  id: string;
  numero: number;
  canal: Canal;
  statut: StatutCommande;
  lignes: LigneCommande[];
  nom: string;
  adresse: string | null;
  heureSouhaitee: string | null;
  creeLe: string;
}

/** Statuts journalisables dans `commandes_evenements` — jamais "en_attente" (état initial automatique, pas une action). */
export type StatutEvenement = Exclude<StatutCommande, "en_attente">;

export interface EvenementCuisine {
  statut: StatutCommande;
  profilNom: string;
  creeLe: string;
}

export interface LivreurActif {
  id: string;
  nom: string;
}

/**
 * Statut suivant valide selon le canal, à partir du statut actuel — jamais
 * "livre" ici : le flash QR du livreur (Module 2) n'est pas encore
 * construit, "pris_par_livreur" reste donc terminal pour cette itération.
 */
export const TRANSITIONS_PAR_CANAL: Record<Canal, Partial<Record<StatutCommande, StatutCommande>>> = {
  sur_place: { en_attente: "en_preparation", en_preparation: "pret", pret: "remis_au_client" },
  emporter: { en_attente: "en_preparation", en_preparation: "pret", pret: "remis_au_client" },
  livraison: { en_attente: "en_preparation", en_preparation: "pret", pret: "pris_par_livreur" },
  en_ligne: {},
};

/** Statuts au-delà desquels une commande n'apparaît plus sur /commandes. */
export const STATUTS_TERMINAUX: StatutCommande[] = ["remis_au_client", "pris_par_livreur", "livre"];

export const LIBELLES_STATUT: Record<StatutCommande, string> = {
  en_attente: "En attente",
  en_preparation: "En préparation",
  pret: "Prêt",
  remis_au_client: "Remis au client",
  pris_par_livreur: "Pris par livreur",
  livre: "Livré",
};
