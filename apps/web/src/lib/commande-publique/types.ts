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
}

export interface ViandePublique {
  id: string;
  nom: string;
}

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
}

export type CanalPublic = Extract<Canal, "sur_place" | "livraison">;

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
