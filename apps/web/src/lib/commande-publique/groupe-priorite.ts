export const SEUIL_GROUPE_3_PLATS = 3;
export const SEUIL_GROUPE_3_MONTANT = 30;
export const SEUIL_GROUPE_4_PLATS = 4;
export const SEUIL_GROUPE_4_MONTANT = 40;
export const NOM_PRODUIT_BOISSON_OFFERTE = "Boisson 2L";

export type PalierGroupe = "GROUPE_3" | "GROUPE_4" | null;

/**
 * Palier "commande groupée" atteint, ou null. La boisson offerte (GROUPE_4)
 * s'applique quel que soit le canal — sur place, à emporter ou livraison —
 * dès que la quantité et le montant sont atteints ; seule la priorité
 * livraison (badge affiché côté UI) reste propre à ce canal, gérée à
 * l'affichage, pas ici. Le montant doit être le montant brut (avant remise
 * fidélité/lancement), jamais le montant net, pour rester cohérent quelle
 * que soit la remise appliquée ensuite. Aucune limite horaire : seuls la
 * quantité et le montant comptent, que la commande soit passée tôt le
 * matin, en plein coup de feu ou la veille pour le lendemain.
 */
export function palierGroupeActif(nbPlats: number, montantBrut: number): PalierGroupe {
  if (nbPlats >= SEUIL_GROUPE_4_PLATS && montantBrut >= SEUIL_GROUPE_4_MONTANT) return "GROUPE_4";
  if (nbPlats >= SEUIL_GROUPE_3_PLATS && montantBrut >= SEUIL_GROUPE_3_MONTANT) return "GROUPE_3";
  return null;
}

export function libellePalierGroupe(palier: PalierGroupe): string | null {
  if (palier === "GROUPE_4") return "GROUPE 4";
  if (palier === "GROUPE_3") return "GROUPE 3";
  return null;
}

/**
 * Message de progression vers la boisson offerte (GROUPE_4), à appeler
 * uniquement quand ce palier n'est pas encore atteint. Doit toujours tenir
 * compte des DEUX conditions (plats ET montant) — un montant déjà suffisant
 * ne doit jamais afficher "Encore 0,00€" tant qu'il manque des plats, ça
 * laisserait croire à tort que l'offre est sur le point de s'activer.
 */
export function messageProgressionBoissonOfferte(nbPlatsValides: number, montantBrut: number): string {
  const platsRestants = Math.max(0, SEUIL_GROUPE_4_PLATS - nbPlatsValides);
  const montantRestant = Math.max(0, SEUIL_GROUPE_4_MONTANT - montantBrut);
  if (platsRestants > 0 && montantRestant > 0) {
    return `Encore ${platsRestants} plat${platsRestants > 1 ? "s" : ""} et ${montantRestant.toFixed(2)}€ pour la boisson 2L offerte 🎁`;
  }
  if (platsRestants > 0) {
    return `Encore ${platsRestants} plat${platsRestants > 1 ? "s" : ""} pour la boisson 2L offerte 🎁`;
  }
  return `Encore ${montantRestant.toFixed(2)}€ pour la boisson 2L offerte 🎁`;
}
