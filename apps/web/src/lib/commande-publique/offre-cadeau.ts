/**
 * Offre du jour « une box OFFERTE : 3 ailes grillées + frites + 2 sauces au choix, par tranche de 20 € d'achats », site public
 * uniquement (demande du patron, mercredi 2026-11-18). Aucune base de données : on ajoute les jours concernés à
 * `JOURS_OFFRE_CADEAU`. Calculée sur le montant réellement payé (après points de fidélité ou remise : pas de
 * cumul d'offres) et seulement pour les commandes SERVIES un jour de l'offre. Une box par tranche de 20 € payés (20 € → 1, 40 € → 2, 80 € → 4).
 */
export const JOURS_OFFRE_CADEAU: readonly string[] = ["2026-11-18"];
export const SEUIL_OFFRE_CADEAU = 20;
export const NB_SAUCES_CADEAU = 2;
export const NOM_AILES_CADEAU = "Ailes de poulet";
export const NOM_FRITES_CADEAU = "Frites";

export function offreCadeauActive(dateService: string): boolean {
  return JOURS_OFFRE_CADEAU.includes(dateService);
}

export function cadeauDebloque(montantPaye: number, dateService: string): boolean {
  return nombreBoxOffertes(montantPaye, dateService) > 0;
}

/** Une box par tranche de 20 € complète : 20 € → 1, 39,90 € → 1, 40 € → 2. */
export function nombreBoxOffertes(montantPaye: number, dateService: string): number {
  if (!offreCadeauActive(dateService)) return 0;
  return Math.floor(montantPaye / SEUIL_OFFRE_CADEAU);
}
