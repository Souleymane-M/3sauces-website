export type PeriodeAudience = "aujourdhui" | "7j" | "30j";

export interface LigneRepartition {
  libelle: string;
  visites: number;
  commandes: number;
}

export interface LigneClic {
  cible: string;
  clics: number;
  visiteurs: number;
}

export interface LigneProduit {
  produit: string;
  vus: number;
  ajoutes: number;
  tempsMoyenSec: number | null;
}

export interface LigneTemps {
  etape: string;
  tempsMoyenSec: number;
  tempsMedianSec: number;
  mesures: number;
}

export interface EtatAudience {
  periode: PeriodeAudience;
  depuis: string;
  visites: number;
  visitesAvecCommande: number;
  provenance: LigneRepartition[];
  systemes: LigneRepartition[];
  appareils: LigneRepartition[];
  navigateurs: LigneRepartition[];
  clics: LigneClic[];
  produits: LigneProduit[];
  tempsEtapes: LigneTemps[];
}
