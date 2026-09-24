import type { ModePaiement } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";

export interface LivraisonAssignee {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  montant: number;
  heureSouhaitee: string | null;
  lignes: LigneCommande[];
  nbPlats: number;
  /** Palier de l'offre "commande groupée" atteint à la soumission, null sinon. */
  palierGroupe: PalierGroupe;
}

export interface PaiementDeclare {
  mode: ModePaiement;
  montant: number;
  payeur?: string;
}
