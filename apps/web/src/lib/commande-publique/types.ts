import type { Canal, Categorie, ModePaiement } from "@3sauces/supabase";

/**
 * Sous-ensemble public de `produits` : jamais de cout_matiere / est_desactivable
 * (données internes) envoyés au navigateur d'un client anonyme.
 *
 * Les produits à prix libre (plat du jour, prix = null) sont exclus du menu
 * public — on ne peut pas laisser un visiteur anonyme saisir son propre prix
 * sur un formulaire non authentifié (contrairement à la caisse, tenue par un
 * employé de confiance).
 */
export interface ProduitPublic {
  id: string;
  nom: string;
  categorie: Categorie;
  prix: number;
  description: string | null;
  nbViandesMax: number;
  /** Si renseigné, viande fixe imposée (ex: Menu Collégien = Poulet) : pas de sélecteur de viande. */
  viandeImposee: string | null;
  /** Nombre max de sauces incluses sans supplément dans le configurateur (0 = pas de sauces proposées). */
  nbSaucesIncluses: number;
  /** Si vrai, le configurateur propose des ajouts payants illimités (viande/sauce supplémentaire). */
  autoriseExtras: boolean;
  /** Nombre de saveurs à choisir avant ajout au panier (0 = ajout direct, 1 = choix obligatoire, ex: Canette 33cl). */
  nbSaveursMax: number;
  /** Si vrai, une canette est incluse dans le prix (ex: Tacos, Barquette, Bowl, Menu Étudiant) : le configurateur propose alors le choix de sa saveur. */
  canetteIncluse: boolean;
}

export interface ViandePublique {
  id: string;
  nom: string;
}

export interface SaucePublique {
  id: string;
  nom: string;
}

export interface SaveurPublique {
  id: string;
  nom: string;
}

/**
 * Produits "supplément" utilisés à l'intérieur du configurateur
 * Tacos/Barquette/Bowl (viande et sauce en plus, avec supplément de prix),
 * jamais affichés comme catégorie autonome sur la page principale — cf.
 * commande-publique-app.tsx qui filtre `categorie === "supplement"`.
 */
export const NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE = "Viande supplémentaire";
export const NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE = "Sauce supplémentaire";

export interface ParametresLivraisonPublic {
  heureDebut: string; // "HH:MM:SS"
  heureFin: string;
  minimumCommande: number;
  zonesActives: string[]; // communes autorisées, ex: ["Dembéni"]
}

export interface LigneCommandePubliquePayload {
  produitId: string;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  /** Saveur choisie pour la canette incluse dans la formule (Tacos/Barquette/Bowl/Menu Étudiant), null si sans objet. */
  boissonIncluse: string | null;
}

export type CanalPublic = Extract<Canal, "sur_place" | "emporter" | "livraison">;

export interface CreerCommandePubliquePayload {
  canal: CanalPublic;
  nom: string;
  telephone: string;
  modePaiement: ModePaiement;
  lignes: LigneCommandePubliquePayload[];
  // Livraison uniquement :
  adresse?: string;
  zone?: string;
  // Créneau souhaité (heure de passage ou de livraison), "HH:MM".
  creneauHeure: string;
}

/**
 * Statuts de suivi affichés côté admin (Page 3). Distinct du statut plus
 * riche de la table `livraisons` (Module 2, QR code livreur) — volontairement
 * pas utilisée ici, trop complexe pour le besoin MVP de cette page.
 */
export type StatutCommandePublique = "recue" | "en_preparation" | "livree";

export interface LigneCommandeAdmin {
  produitId: string;
  nom: string;
  quantite: number;
  prixUnitaire: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
}

export interface CommandeAdmin {
  id: string;
  canal: CanalPublic;
  statut: StatutCommandePublique;
  montant: number;
  modePaiement: ModePaiement | null;
  nom: string | null;
  telephone: string | null;
  adresse: string | null;
  zone: string | null;
  heureSouhaitee: string; // ISO 8601
  lignes: LigneCommandeAdmin[];
  creeLe: string; // ISO 8601
}
