import type { Canal, StatutCommande } from "@3sauces/supabase";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";

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
  heureSouhaitee: string | null;
  creeLe: string;
  evenements: EvenementHistorique[];
  livreurNom: string | null;
  /** Palier de l'offre "commande groupée avant 11h" atteint à la soumission, null sinon. */
  palierGroupe: PalierGroupe;
}

export interface TempsPreparationEmploye {
  profilNom: string;
  tempsMoyenMinutes: number;
  nombreCommandes: number;
}
