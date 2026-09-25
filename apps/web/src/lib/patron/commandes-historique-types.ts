import type { Canal, ModePaiement, StatutCommande } from "@3sauces/supabase";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import type { LigneCommande } from "@/lib/caisse/types";

export interface EvenementHistorique {
  statut: StatutCommande;
  profilNom: string;
  creeLe: string;
}

export interface CommandeHistorique {
  id: string;
  numero: number;
  canal: Canal;
  statut: StatutCommande;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  heureSouhaitee: string | null;
  creeLe: string;
  evenements: EvenementHistorique[];
  livreurNom: string | null;
  /** Palier de l'offre "commande groupée" atteint à la soumission, null sinon. */
  palierGroupe: PalierGroupe;
  /** Contenu de la commande — jamais affiché sur /commandes (cuisine), mais utile ici pour un suivi à distance complet. */
  lignes: LigneCommande[];
  montant: number;
  modePaiement: ModePaiement | null;
}

export interface TempsPreparationEmploye {
  profilNom: string;
  tempsMoyenMinutes: number;
  nombreCommandes: number;
}
