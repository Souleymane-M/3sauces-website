import type { Canal, Categorie, ModePaiement } from "@3sauces/supabase";

/**
 * Structure applicative stockée dans `commandes.contenu` (JSONB).
 * Un instantané des lignes au moment de la vente : on fige nom/prix/coût pour
 * que l'historique reste exact même si la carte change ensuite.
 */
export interface LigneCommande {
  produitId: string;
  nom: string;
  categorie: Categorie;
  quantite: number;
  prixUnitaire: number;
  coutMatiereUnitaire: number | null;
  viandes: string[];
  /** Sauces incluses (site public uniquement pour l'instant — cf. commande-publique). Absent/vide côté caisse. */
  sauces?: string[];
  canetteIncluse: boolean;
}

export interface ProduitCaisse {
  id: string;
  nom: string;
  categorie: Categorie;
  prix: number | null;
  coutMatiere: number | null;
  canetteIncluse: boolean;
  nbViandesMax: number;
  estPlatDuJour: boolean;
  estDesactivable: boolean;
}

export interface ViandeCaisse {
  id: string;
  nom: string;
}

export interface LigneCommandePayload {
  produitId: string;
  quantite: number;
  viandes: string[];
  /** Prix saisi manuellement, uniquement pour un produit à prix libre (plat du jour). */
  prixSaisi?: number;
}

export interface CreerCommandePayload {
  canal: Canal;
  modePaiement: ModePaiement;
  lignes: LigneCommandePayload[];
  clientTelephone?: string;
  recompenseAppliquee?: boolean;
}
