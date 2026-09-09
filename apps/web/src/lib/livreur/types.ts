import type { ModePaiement } from "@3sauces/supabase";

export interface LivraisonAssignee {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  montant: number;
  heureSouhaitee: string | null;
}

export interface PaiementDeclare {
  mode: ModePaiement;
  montant: number;
  payeur?: string;
}
