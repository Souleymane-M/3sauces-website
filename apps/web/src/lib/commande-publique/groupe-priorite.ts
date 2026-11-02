export const SEUIL_GROUPE_3_PLATS = 3;
export const SEUIL_GROUPE_3_MONTANT = 30;
export const SEUIL_GROUPE_4_PLATS = 4;
export const SEUIL_GROUPE_4_MONTANT = 40;
export const NOM_PRODUIT_BOISSON_OFFERTE = "Boisson 2L";

export type PalierGroupe = "GROUPE_3" | "GROUPE_4" | null;

/**
 * Palier "commande groupée avant 11h" atteint, ou null. La boisson offerte
 * (GROUPE_4) s'applique quel que soit le canal — sur place, à emporter ou
 * livraison — dès que la quantité et le montant sont atteints ; seule la
 * priorité livraison (badge affiché côté UI) reste propre à ce canal, gérée
 * à l'affichage, pas ici. Le montant doit être le montant brut (avant remise
 * fidélité/lancement), jamais le montant net, pour rester cohérent quelle
 * que soit la remise appliquée ensuite.
 *
 * `minutesActuelles` est l'heure RÉELLE (Mayotte) au moment où le client
 * clique sur "Commander" — jamais l'heure du créneau de retrait/livraison
 * demandé. Un client qui commande à 9h pour un retrait à 14h le jour même
 * garde l'avantage ; un client qui commande à 19h le soir pour une livraison
 * groupée le lendemain midi ne l'a pas, même si 12h < 11h+24h — seul le
 * moment du clic compte, jamais la date/heure de retrait choisie.
 */
export function palierGroupeActif(_nbPlats: number, montantBrut: number): PalierGroupe {
  return palierGroupeSelonQuantite(_nbPlats, montantBrut);
}

/**
 * Boisson 2L offerte dès 40€ de commande (brut, avant remise), à toute heure
 * et quel que soit le nombre d'articles — décision du patron, 2026-11-02 :
 * plus de limite à 11h, plus de minimum de plats, plus de priorité livraison.
 */
export function palierGroupeSelonQuantite(_nbPlats: number, montantBrut: number): PalierGroupe {
  return montantBrut >= SEUIL_GROUPE_4_MONTANT ? "GROUPE_4" : null;
}

/**
 * Nombre de "plats" à utiliser pour évaluer les paliers ci-dessus —
 * quantité totale d'articles du panier, quel que soit le mode de saisie
 * (simple ou groupée). Distinct de `compterPlatsGroupes` (lib/plats.ts),
 * qui ne compte que les plats-conteneurs explicitement créés en mode
 * "Commande groupée" et vaut toujours 0 en mode simple : une commande
 * simple de 90€ de grillades ne touchait donc jamais la livraison
 * prioritaire ni la boisson offerte, même largement au-dessus des seuils
 * (repéré le 2026-10-14). `compterPlatsGroupes` reste utilisé tel quel
 * pour `nb_plats` (badge prioritaire cuisine, affichage ticket) et la
 * validation du mode groupé — seule l'évaluation de ces paliers change.
 */
export function compterPlatsPourPalier<T extends { quantite: number }>(lignes: T[]): number {
  return lignes.reduce((total, l) => total + l.quantite, 0);
}

/**
 * Nombre de boissons 2L offertes : une par tranche de 40€ entamée, dès que
 * le palier GROUPE_4 (4 plats et 40€) est atteint — 40€→1, 80€→2, 90€→2,
 * 120€→3... Jamais de boisson sous ce palier.
 */
export function nombreBoissonsOffertes(_nbPlats: number, montantBrut: number): number {
  if (montantBrut < SEUIL_GROUPE_4_MONTANT) return 0;
  return Math.floor(montantBrut / SEUIL_GROUPE_4_MONTANT);
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
export function messageProgressionBoissonOfferte(_nbPlatsValides: number, montantBrut: number): string {
  const montantRestant = Math.max(0, SEUIL_GROUPE_4_MONTANT - montantBrut);
  return `Encore ${montantRestant.toFixed(2)}€ pour la boisson 2L offerte 🎁`;
}
