/**
 * Offre du jour « 1 canette offerte par tranche de 10 € d'achats », site public uniquement (demande du
 * patron, vendredi 2026-11-13). Aucune base de données : on ajoute les jours concernés à `JOURS_OFFRE_CANETTE`.
 * Calculée sur le montant réellement payé (après points de fidélité ou remise : pas de cumul d'offres), et
 * seulement pour les commandes SERVIES un jour de l'offre (pas celles passées ce jour-là pour un autre jour).
 */
export const JOURS_OFFRE_CANETTE: readonly string[] = ["2026-11-13"];
export const MONTANT_PAR_CANETTE_OFFERTE = 10;

export function offreCanetteActive(dateService: string): boolean {
  return JOURS_OFFRE_CANETTE.includes(dateService);
}

/** Une canette par tranche de 10 € complète : 10 € → 1, 19,90 € → 1, 20 € → 2. */
export function nombreCanettesOffertes(montantPaye: number, dateService: string): number {
  if (!offreCanetteActive(dateService)) return 0;
  return Math.floor(montantPaye / MONTANT_PAR_CANETTE_OFFERTE);
}
