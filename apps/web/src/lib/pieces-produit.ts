/**
 * Certains produits (grillades, accompagnements) sont vendus par paquet de
 * plusieurs pièces, indiqué directement dans leur nom ("Croupion x3",
 * "Ailes de poulet x3") — jamais une donnée séparée en base, le nom EST la
 * source de vérité du nombre de pièces par paquet. Ces deux fonctions
 * évitent tout calcul mental, au client comme à qui prépare la commande :
 * `quantite` (nombre de paquets achetés) ne dit jamais directement combien
 * de pièces préparer/servir.
 */
export function piecesParPaquet(nomProduit: string): number {
  const correspondance = nomProduit.match(/x\s*(\d+)\s*$/i);
  return correspondance ? Number(correspondance[1]) : 1;
}

/** "Croupion x3" -> "Croupion" ; un nom sans multiplicateur ("Cuisse poulet") est retourné tel quel. */
export function nomSansMultiplicateur(nomProduit: string): string {
  return nomProduit.replace(/\s*x\s*\d+\s*$/i, "").trim();
}

/** Accord au pluriel minimal (ajoute un "s" si absent) pour une phrase client — jamais utilisé sur les écrans de préparation, où le nom brut suffit. */
export function nomPluriel(nomSansMultiplicateur: string, quantiteTotale: number): string {
  if (quantiteTotale <= 1 || /[sxz]$/i.test(nomSansMultiplicateur)) return nomSansMultiplicateur;
  return `${nomSansMultiplicateur}s`;
}
