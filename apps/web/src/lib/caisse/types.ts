import type { Canal, Categorie, ModePaiement } from "@3sauces/supabase";
import type { ProduitPublic } from "@/lib/commande-publique/types";

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
  /** Sauces incluses (jusqu'à `nb_sauces_incluses` du produit). */
  sauces?: string[];
  /** Saveur choisie pour un produit vendu directement à la saveur (ex: Canette 33cl). */
  saveurs?: string[];
  /** Saveur de la canette incluse dans une formule (Tacos/Barquette/Bowl/Menu Étudiant). */
  boissonIncluse?: string | null;
  canetteIncluse: boolean;
}

/**
 * Produit caisse : mêmes champs/règles que `ProduitPublic` (configurateur
 * identique au site — viandes, sauces incluses, extras, saveur de boisson,
 * canette incluse), plus les champs internes à la caisse (coût matière,
 * indicateurs plat-du-jour/désactivable). `prix` reste nullable : la caisse,
 * contrairement au site public, vend aussi des produits à prix libre
 * (ex: "Plat du jour", prix saisi chaque jour par l'employé).
 */
export interface ProduitCaisse extends Omit<ProduitPublic, "prix"> {
  prix: number | null;
  coutMatiere: number | null;
  estPlatDuJour: boolean;
  estDesactivable: boolean;
}

export interface ViandeCaisse {
  id: string;
  nom: string;
}

export interface SauceCaisse {
  id: string;
  nom: string;
}

export interface SaveurCaisse {
  id: string;
  nom: string;
}

export interface LigneCommandePayload {
  produitId: string;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
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
