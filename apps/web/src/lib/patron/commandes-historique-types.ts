import type { Canal, StatutCommande } from "@3sauces/supabase";

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
}

export interface TempsPreparationEmploye {
  profilNom: string;
  tempsMoyenMinutes: number;
  nombreCommandes: number;
}
