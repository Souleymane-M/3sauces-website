import type { ModePaiement } from "@3sauces/supabase";

export interface PaiementDeclareDetail {
  mode: ModePaiement;
  montant: number;
  payeur: string | null;
}

export interface LivraisonAEncaisser {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  montant: number;
  modePaiement: ModePaiement | null;
  creeLe: string;
  /** "non_paye" = pas encore livrée/déclarée ; "declare" = déclarée par le livreur, à valider. */
  statutPaiement: "non_paye" | "declare";
  paiementsDeclares: PaiementDeclareDetail[];
  alerteSignalee: boolean;
  alerteNote: string | null;
}

export interface EncaissementsJour {
  especes: number;
  cb: number;
}
