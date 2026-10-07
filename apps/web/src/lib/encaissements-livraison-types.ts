import type { Canal, ModePaiement, ModePaiementCommande } from "@3sauces/supabase";

export interface PaiementDeclareDetail {
  mode: ModePaiement;
  montant: number;
  payeur: string | null;
}

/** Malgré son nom (historique), couvre depuis le 2026-10-07 toute commande non payée à encaisser plus tard — pas seulement une livraison, cf. lib/encaissements-livraison.ts. */
export interface LivraisonAEncaisser {
  id: string;
  numero: number;
  canal: Canal;
  nom: string;
  adresse: string | null;
  montant: number;
  modePaiement: ModePaiementCommande | null;
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
