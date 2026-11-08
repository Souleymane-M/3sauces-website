/** Catégories de dépenses (utilisées par l'écran, l'API et la lecture de facture par l'IA). */
export const CATEGORIES_DEPENSE = [
  { valeur: "viande", libelle: "Viandes et poissons" },
  { valeur: "boissons", libelle: "Boissons" },
  { valeur: "legumes_epicerie", libelle: "Légumes, épicerie, frites, pain" },
  { valeur: "emballages", libelle: "Emballages, sacs, barquettes" },
  { valeur: "gaz_eau_electricite", libelle: "Gaz, eau, électricité" },
  { valeur: "loyer", libelle: "Loyer" },
  { valeur: "salaires", libelle: "Salaires" },
  { valeur: "carburant_transport", libelle: "Carburant, location de véhicule, livraison" },
  { valeur: "materiel", libelle: "Matériel, équipement" },
  { valeur: "assurance_banque_comptable", libelle: "Assurance, banque, comptable, abonnements (téléphone, internet)" },
  { valeur: "publicite", libelle: "Publicité, communication" },
  { valeur: "autre", libelle: "Autre" },
] as const;

export type CategorieDepense = (typeof CATEGORIES_DEPENSE)[number]["valeur"];

export const MODES_PAIEMENT_DEPENSE = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "carte", libelle: "Carte" },
  { valeur: "virement", libelle: "Virement" },
  { valeur: "prelevement", libelle: "Prélèvement" },
  { valeur: "cheque", libelle: "Chèque" },
] as const;

export type ModePaiementDepense = (typeof MODES_PAIEMENT_DEPENSE)[number]["valeur"];

/** Achats de matières et produits vendus (le « coût de revient »), par opposition aux charges de fonctionnement. */
export const CATEGORIES_ACHATS: CategorieDepense[] = ["viande", "boissons", "legumes_epicerie", "emballages"];

/** Coûts directs de production et de vente : tout ce qui entre dans la marge brute (matières, emballages, gaz, salaires, livraison). */
export const CATEGORIES_COUTS_DIRECTS: CategorieDepense[] = [
  ...CATEGORIES_ACHATS,
  "gaz_eau_electricite",
  "salaires",
  "carburant_transport",
];

/** Objectif de marge brute fixé par le patron. */
export const OBJECTIF_MARGE_BRUTE = 60;

export interface LigneDepense {
  designation: string;
  quantite: number | null;
  unite: string | null;
  prixUnitaire: number | null;
  montant: number;
}

export function libelleCategorie(valeur: string): string {
  return CATEGORIES_DEPENSE.find((c) => c.valeur === valeur)?.libelle ?? valeur;
}
