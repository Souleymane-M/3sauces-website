/**
 * Offre du jour « 1 canette offerte par tranche de 10 € d'achats », site public uniquement (demande du
 * patron, vendredi 2026-11-13). Aucune base de données : on ajoute les jours concernés à `JOURS_OFFRE_CANETTE`.
 * Calculée sur le montant brut du panier (avant points de fidélité), comme l'offre groupée.
 */
export const JOURS_OFFRE_CANETTE: readonly string[] = ["2026-11-13"];
export const MONTANT_PAR_CANETTE_OFFERTE = 10;

export function offreCanetteActive(dateMayotte: string): boolean {
  return JOURS_OFFRE_CANETTE.includes(dateMayotte);
}

/** Une canette par tranche de 10 € complète : 10 € → 1, 19,90 € → 1, 20 € → 2. */
export function nombreCanettesOffertes(montantBrut: number, dateMayotte: string): number {
  if (!offreCanetteActive(dateMayotte)) return 0;
  return Math.floor(montantBrut / MONTANT_PAR_CANETTE_OFFERTE);
}
