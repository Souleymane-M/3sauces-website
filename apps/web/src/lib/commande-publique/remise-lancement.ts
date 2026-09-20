export const MONTANT_REMISE_LANCEMENT = 2;
export const SEUIL_REMISE_LANCEMENT = 10;

/**
 * Remise de lancement (-2€ dès 10€, site public uniquement, opération à
 * durée limitée) : comparaison de chaînes ISO "YYYY-MM-DD" — même technique
 * que `dateMayotteIso()` — jamais bloquante si les dates ne sont pas
 * configurées (feature simplement inactive).
 */
export function remiseLancementActive(debut: string | null, fin: string | null, aujourdHui: string): boolean {
  if (!debut || !fin) return false;
  return aujourdHui >= debut && aujourdHui <= fin;
}
