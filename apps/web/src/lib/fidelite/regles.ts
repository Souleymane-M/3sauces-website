// Règles et copie du programme de fidélité — source unique, réutilisée par
// la caisse, le site public et les emails, pour ne jamais afficher deux
// messages différents pour la même situation.
//
// IMPORTANT : l'accumulation se fait sur l'ensemble des commandes d'un
// client (comptoir + livraison + site), jamais par commande individuelle —
// ne jamais écrire "10€ minimum par commande pour un tampon", c'est faux.
//
// RÈGLE DU PROGRAMME (confirmée explicitement par le patron le 2026-10-07
// avec l'exemple de Mouna, 76€ dépensés → 7 tampons) :
// 10€ dépensés = 1 tampon (simple marqueur de progression, affiché partout,
// y compris avant d'avoir débloqué quoi que ce soit — ex: Mouna à 76€ doit
// voir "7 tampons", pas "0 tampon").
// 10 tampons (donc 100€ cumulés) débloquent une récompense de 10€,
// individuelle, expirable 3 mois après son obtention, utilisable par
// tranche de 10 tampons à la fois (le client n'est jamais obligé de tout
// dépenser d'un coup), consommée du plus proche de l'expiration en premier
// (FIFO). Chaque ligne `fidelite_tampons` en base vaut 10€ et correspond à
// UN groupe de 10 tampons affichés — jamais confondre la ligne technique
// (10€, groupe de 10) avec le tampon affiché (1 unité = 10€ de progression).

export const MONTANT_RECOMPENSE = 10;
/** Montant cumulé nécessaire pour qu'une récompense se forme. */
export const SEUIL_TAMPON = 100;
export const TAGLINE_FIDELITE = "Chaque euro compte chez 3 Sauces";

export function formaterEuros(montant: number): string {
  const arrondi = Math.round(montant * 100) / 100;
  const texte = Number.isInteger(arrondi) ? arrondi.toString() : arrondi.toFixed(2).replace(".", ",");
  return `${texte}€`;
}

/**
 * Nombre total de tampons de PROGRESSION à afficher pour un client (ex:
 * fiche /patron) : montant cumulé pas encore converti en récompense
 * (`montantCumule`, < 100€) + les récompenses déjà débloquées et pas
 * encore utilisées (`tamponsDisponibles`, en lignes `fidelite_tampons` de
 * 10€/10 tampons chacune). Mouna (76€, 0 récompense) → 7. Un client avec
 * 115€ cumulés dont 1 récompense déjà débloquée (reliquat 15€) → 1 + 10 =
 * 11 tampons.
 */
export function progressionTampons(montantCumule: number, tamponsDisponibles: number): number {
  return Math.floor(montantCumule / MONTANT_RECOMPENSE) + tamponsDisponibles * (SEUIL_TAMPON / MONTANT_RECOMPENSE);
}

/** Nombre de tampons qui forment une récompense — toujours "10 tampons", jamais un montant en €, dans toute accroche visible par un client (demande explicite du patron, 2026-10-12 : "100€"/"cumulés" freinent, l'unité visible est le tampon). */
export const NB_TAMPONS_RECOMPENSE = SEUIL_TAMPON / MONTANT_RECOMPENSE;

/** Sous ce montant restant avant la prochaine récompense, l'accroche "vous débloquez 10€ offerts" devient utile ; au-delà, "plus que X€ pour votre prochain tampon" suffit. */
export const SEUIL_AFFICHAGE_PROGRESSION = 30;

export const MESSAGE_GENERIQUE_FIDELITE = `🎁 ${formaterEuros(MONTANT_RECOMPENSE)} dépensés = 1 tampon. ${NB_TAMPONS_RECOMPENSE} tampons = ${formaterEuros(MONTANT_RECOMPENSE)} offerts.`;
const MESSAGE_RECOMPENSE_DISPONIBLE = `🎉 ${formaterEuros(MONTANT_RECOMPENSE)} offerts à utiliser dès votre prochaine commande !`;

export interface SoldeTampons {
  /** Nombre de récompenses disponibles (groupes de 10 tampons / 10€), pas le nombre de tampons. */
  nombre: number;
  /** Date d'expiration de la récompense disponible la plus proche d'expirer (la première consommée, FIFO) — null si aucune récompense disponible. */
  prochaineExpiration: string | null;
}

/**
 * Message de solde hors contexte d'une commande en cours (page "Voir mon
 * solde fidélité", fiche client /patron, email générique) : jamais de
 * mention de "100€"/"cumulés", uniquement le tampon comme unité, et un
 * message de progression ("plus que X€") toujours affiché plutôt qu'un
 * silence quand aucune récompense n'est encore débloquée.
 */
export function messageSoldeFidelite(reliquat: number, solde: SoldeTampons): string {
  if (solde.nombre > 0) return MESSAGE_RECOMPENSE_DISPONIBLE;
  const resteRecompense = SEUIL_TAMPON - reliquat;
  if (resteRecompense <= SEUIL_AFFICHAGE_PROGRESSION) {
    return `🎁 Plus que ${formaterEuros(resteRecompense)} et vous débloquez ${formaterEuros(MONTANT_RECOMPENSE)} offerts !`;
  }
  const resteTampon = MONTANT_RECOMPENSE - (reliquat % MONTANT_RECOMPENSE);
  return `🎁 Plus que ${formaterEuros(resteTampon)} pour votre prochain tampon.`;
}

export interface ProgressionCommande {
  /** Tampons (10€ chacun) que cette commande fait gagner — jamais confondu avec une récompense (groupe de 10). */
  tamponsGagnes: number;
  /** Une récompense reste disponible (ou vient d'être débloquée) une fois cette commande prise en compte. */
  recompenseDisponibleApres: boolean;
  resteProchaineRecompense: number;
  resteProchainTampon: number;
}

/**
 * Calcule ce qu'une commande apporte en tampons — à partir du reliquat et
 * du nombre de récompenses déjà disponibles juste avant cette commande (0
 * si inconnu, ex: client non identifié sur le site public) et du nombre de
 * récompenses utilisées sur cette même commande.
 *
 * Seul le montant réellement payé en plus des récompenses utilisées compte :
 * une commande de 20€ qui utilise 1 récompense (10€) ne doit faire gagner
 * de nouveaux tampons que sur ces 10€ net, jamais sur les 20€ bruts —
 * sinon utiliser une récompense permettrait d'en regagner une quasi
 * gratuitement.
 */
export function calculerProgressionCommande(
  totalCommande: number,
  reliquatAvant: number = 0,
  tamponsDisponiblesAvant: number = 0,
  tamponsUtilises: number = 0
): ProgressionCommande {
  const net = Math.max(0, totalCommande - tamponsUtilises * MONTANT_RECOMPENSE);
  const totalApres = reliquatAvant + net;
  const reliquatApres = totalApres % SEUIL_TAMPON;
  const recompensesGagnees = Math.floor(totalApres / SEUIL_TAMPON);
  return {
    tamponsGagnes: Math.floor(totalApres / MONTANT_RECOMPENSE) - Math.floor(reliquatAvant / MONTANT_RECOMPENSE),
    recompenseDisponibleApres: tamponsDisponiblesAvant - tamponsUtilises + recompensesGagnees > 0,
    resteProchaineRecompense: SEUIL_TAMPON - reliquatApres,
    resteProchainTampon: MONTANT_RECOMPENSE - (reliquatApres % MONTANT_RECOMPENSE),
  };
}

/**
 * Texte prêt à afficher juste à côté du total (site public et caisse) ou
 * dans l'email de confirmation — toujours un message, jamais `null` : même
 * loin de toute récompense, "plus que X€ pour votre prochain tampon" reste
 * informatif (contrairement à l'ancien comportement qui n'affichait rien
 * tant qu'on n'approchait pas d'une récompense complète).
 */
export function texteProgressionCommande(p: ProgressionCommande): string {
  if (p.recompenseDisponibleApres) return MESSAGE_RECOMPENSE_DISPONIBLE;
  if (p.tamponsGagnes > 0) {
    return `🎁 +${p.tamponsGagnes} tampon${p.tamponsGagnes > 1 ? "s" : ""} avec cette commande ! ${NB_TAMPONS_RECOMPENSE} tampons = ${formaterEuros(MONTANT_RECOMPENSE)} offerts.`;
  }
  if (p.resteProchaineRecompense <= SEUIL_AFFICHAGE_PROGRESSION) {
    return `🎁 Plus que ${formaterEuros(p.resteProchaineRecompense)} et vous débloquez ${formaterEuros(MONTANT_RECOMPENSE)} offerts !`;
  }
  return `🎁 Plus que ${formaterEuros(p.resteProchainTampon)} pour votre prochain tampon.`;
}
