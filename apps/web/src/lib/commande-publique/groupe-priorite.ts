export const HEURE_LIMITE_GROUPE_MINUTES = 11 * 60; // 11h00, heure de Mayotte
export const SEUIL_GROUPE_3_PLATS = 3;
export const SEUIL_GROUPE_3_MONTANT = 30;
export const SEUIL_GROUPE_4_PLATS = 4;
export const SEUIL_GROUPE_4_MONTANT = 40;
export const NOM_PRODUIT_BOISSON_OFFERTE = "Boisson 2L";

export type PalierGroupe = "GROUPE_3" | "GROUPE_4" | null;

/**
 * Palier "commande groupée avant 11h" atteint, ou null. Priorité + boisson
 * offerte réservées à la livraison, commandée avant 11h (heure de Mayotte) —
 * le montant doit être le montant brut (avant remise fidélité/lancement),
 * jamais le montant net, pour rester cohérent quelle que soit la remise
 * appliquée ensuite.
 */
export function palierGroupeActif(
  nbPlats: number,
  montantBrut: number,
  canal: string,
  minutesActuelles: number
): PalierGroupe {
  if (canal !== "livraison") return null;
  if (minutesActuelles >= HEURE_LIMITE_GROUPE_MINUTES) return null;
  if (nbPlats >= SEUIL_GROUPE_4_PLATS && montantBrut >= SEUIL_GROUPE_4_MONTANT) return "GROUPE_4";
  if (nbPlats >= SEUIL_GROUPE_3_PLATS && montantBrut >= SEUIL_GROUPE_3_MONTANT) return "GROUPE_3";
  return null;
}

export function libellePalierGroupe(palier: PalierGroupe): string | null {
  if (palier === "GROUPE_4") return "GROUPE 4";
  if (palier === "GROUPE_3") return "GROUPE 3";
  return null;
}
