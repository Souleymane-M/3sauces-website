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
  /** "stripe" = déjà réglée en ligne — rien à encaisser, jamais redemander de paiement au client. */
  modePaiement: ModePaiement | null;
}

export interface PaiementDeclare {
  mode: ModePaiement;
  montant: number;
  payeur?: string;
}
