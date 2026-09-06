import type { Categorie } from "@3sauces/supabase";

/**
 * Types et constantes partagés entre le serveur (lib/patron/produits.ts) et
 * le client (components/patron/produits-app.tsx) — séparés du fichier
 * `server-only` pour que le composant client puisse importer `CATEGORIES`
 * et les types sans entraîner tout le code d'accès Supabase dans le bundle
 * navigateur.
 */
export const CATEGORIES: { valeur: Categorie; libelle: string }[] = [
  { valeur: "plat_du_jour", libelle: "Plat du jour" },
  { valeur: "menu_special", libelle: "Menu spécial" },
  { valeur: "snacking", libelle: "Snacking" },
  { valeur: "grillade", libelle: "Grillade" },
  { valeur: "accompagnement", libelle: "Accompagnement" },
  { valeur: "cuisine_locale", libelle: "Cuisine locale" },
  { valeur: "boisson", libelle: "Boisson" },
  { valeur: "supplement", libelle: "Supplément" },
];

export interface ProduitAdmin {
  id: string;
  nom: string;
  categorie: Categorie;
  description: string | null;
  prix: number | null;
  actif: boolean;
  nbViandesMax: number;
  viandeImposee: string | null;
  nbSaucesIncluses: number;
  autoriseExtras: boolean;
  nbSaveursMax: number;
  canetteIncluse: boolean;
}

export interface ProduitAdminInput {
  nom: string;
  categorie: Categorie;
  description: string | null;
  prix: number | null;
  nbViandesMax?: number;
  viandeImposee?: string | null;
  nbSaucesIncluses?: number;
  autoriseExtras?: boolean;
  nbSaveursMax?: number;
  canetteIncluse?: boolean;
}

export interface ProduitAdminPatch {
  nom?: string;
  categorie?: Categorie;
  description?: string | null;
  prix?: number | null;
  actif?: boolean;
  nbViandesMax?: number;
  viandeImposee?: string | null;
  nbSaucesIncluses?: number;
  autoriseExtras?: boolean;
  nbSaveursMax?: number;
  canetteIncluse?: boolean;
}
