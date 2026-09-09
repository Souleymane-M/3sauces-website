import type { ModePaiement } from "@3sauces/supabase";

export interface LivraisonAEncaisser {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  montant: number;
  modePaiement: ModePaiement | null;
  creeLe: string;
}
