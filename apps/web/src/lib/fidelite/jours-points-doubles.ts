/**
 * Jours où les points de fidélité sont doublés pour TOUS les clients (anciens et nouveaux) qui commandent SUR LE SITE (demande du patron, 2026-11-19, élargie à tous le 2026-11-20).
 * Fichier sans code serveur : lu par le site (bandeau) ET par le serveur (calcul réel, cf. points-doubles.ts). On ajoute les jours ici.
 */
export const JOURS_POINTS_DOUBLES_ACTIFS: readonly string[] = ["2026-11-20"];

export function pointsDoublesPossibles(dateService: string): boolean {
  return JOURS_POINTS_DOUBLES_ACTIFS.includes(dateService);
}
