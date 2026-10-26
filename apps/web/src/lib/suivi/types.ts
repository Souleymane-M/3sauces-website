export const TYPES_EVENEMENT = ["visite", "mode_choisi", "ajout_panier", "produit_ajoute", "commande_validee"] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export const ETAPES = ["choix_mode", "menu", "panier", "validation"] as const;
export type EtapeVisiteur = (typeof ETAPES)[number];

export const LIBELLES_ETAPES: Record<EtapeVisiteur, string> = {
  choix_mode: "Choisit commande simple ou groupée",
  menu: "Parcourt le menu",
  panier: "A un panier en cours",
  validation: "Valide sa commande",
};

/** Un visiteur est "en ligne" s'il a donné signe de vie dans ce délai (secondes). */
export const DELAI_EN_LIGNE_SEC = 50;

export interface VisiteurEnLigne {
  etape: EtapeVisiteur;
  depuisSec: number;
}

export interface EtatSuivi {
  enLigne: VisiteurEnLigne[];
  entonnoir: { aujourdhui: Record<TypeEvenement, number>; hier: Record<TypeEvenement, number> };
  topProduits: { produit: string; visiteurs: number }[];
}
