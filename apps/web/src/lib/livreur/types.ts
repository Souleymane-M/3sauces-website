import type { ModePaiement } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";

export interface LivraisonAssignee {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  montant: number;
  heureSouhaitee: string | null;
  lignes: LigneCommande[];
  nbPlats: number;
}

export interface PaiementDeclare {
  mode: ModePaiement;
  montant: number;
  payeur?: string;
}
