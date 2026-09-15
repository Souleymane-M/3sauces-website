/**
 * Groupes de combinaison des accompagnements de Plat du jour — jamais
 * "Salade", qui reste incluse automatiquement sans choix (mécanisme
 * distinct). Constantes en dur, sur le même principe que
 * NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE : un nouvel accompagnement (rare)
 * nécessitera de toute façon une décision humaine sur son groupe.
 *
 * Combinable : jusqu'à 2 en même temps dans un même plat (ex: Manioc +
 * Bananes). Exclusif : un seul à la fois, jamais combiné avec un autre
 * accompagnement, combinable ou exclusif.
 */
export const GROUPE_ACCOMPAGNEMENT_COMBINABLE = new Set(["Manioc x3", "Bananes x3", "Jimbi (Songe) x3"]);
export const GROUPE_ACCOMPAGNEMENT_EXCLUSIF = new Set(["Riz blanc", "Riz jaune", "Frites"]);

/**
 * Valide qu'une combinaison d'accompagnements respecte les règles de
 * groupe — utilisée aussi bien côté client (aperçu) que côté serveur
 * (validation autoritaire, jamais confiance dans ce qu'envoie le client).
 */
export function combinaisonAccompagnementsValide(noms: string[]): boolean {
  if (noms.length === 0) return false;
  if (new Set(noms).size !== noms.length) return false;

  const exclusifs = noms.filter((n) => GROUPE_ACCOMPAGNEMENT_EXCLUSIF.has(n));
  const combinables = noms.filter((n) => GROUPE_ACCOMPAGNEMENT_COMBINABLE.has(n));
  if (exclusifs.length + combinables.length !== noms.length) return false;

  if (exclusifs.length > 0) return exclusifs.length === 1 && combinables.length === 0;
  return combinables.length <= 2;
}
