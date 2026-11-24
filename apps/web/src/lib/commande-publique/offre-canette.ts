import { SEUIL_GROUPE_4_MONTANT } from "./groupe-priorite";

/** Tous les jours de `debut` à `fin` inclus (AAAA-MM-JJ), sans dépendre du fuseau horaire. */
function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let t = Date.parse(`${debut}T00:00:00Z`); t <= Date.parse(`${fin}T00:00:00Z`); t += 86_400_000) {
    jours.push(new Date(t).toISOString().slice(0, 10));
  }
  return jours;
}

/** Jours isolés déjà faits, puis l'opération « affiche au restaurant » : du mercredi 25/11 au samedi 12/12/2026 (début des vacances). */
export const FIN_OFFRE_CANETTE = "2026-12-12";
/**
 * Offre du jour « 1 canette offerte par tranche de 10 € d'achats », site public uniquement (demande du
 * patron, vendredi 2026-11-13). Aucune base de données : on ajoute les jours concernés à `JOURS_OFFRE_CANETTE`.
 * Calculée sur le montant réellement payé (après points de fidélité ou remise : pas de cumul d'offres), et
 * seulement pour les commandes SERVIES un jour de l'offre (pas celles passées ce jour-là pour un autre jour).
 */
export const JOURS_OFFRE_CANETTE: readonly string[] = ["2026-11-13", "2026-11-23", ...joursEntre("2026-11-25", FIN_OFFRE_CANETTE)];
export const MONTANT_PAR_CANETTE_OFFERTE = 10;

export function offreCanetteActive(dateService: string): boolean {
  return JOURS_OFFRE_CANETTE.includes(dateService);
}

/** Une canette par tranche de 10 € complète : 10 € → 1, 19,90 € → 1, 20 € → 2. */
export function nombreCanettesOffertes(montantPaye: number, dateService: string): number {
  if (!offreCanetteActive(dateService)) return 0;
  // Non cumulable avec la boisson 2 L offerte (dès 40 € payés) : à partir de ce palier, c'est la boisson 2 L qui s'applique (décision du patron, 24/11).
  if (montantPaye >= SEUIL_GROUPE_4_MONTANT) return 0;
  return Math.floor(montantPaye / MONTANT_PAR_CANETTE_OFFERTE);
}
