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

export interface ProgressionFidelite {
  /** Nombre de nouvelles récompenses (groupes de 10 tampons) que cette commande fait gagner. */
  tamponsGagnes: number;
  /** Montant restant à ajouter pour débloquer la prochaine récompense. */
  montantProchainTampon: number;
}

/**
 * Calcule ce qu'une commande apporte en NOUVELLES récompenses — à partir du
 * reliquat juste avant cette commande (0 si inconnu, ex: client non
 * identifié sur le site public) et du nombre de récompenses utilisées sur
 * cette même commande. Une récompense se forme tous les SEUIL_TAMPON (100€)
 * cumulés.
 *
 * Seul le montant réellement payé en plus des récompenses utilisées compte :
 * une commande de 20€ qui utilise 1 récompense (10€) ne doit faire gagner
 * de nouvelle récompense que sur ces 10€ net, jamais sur les 20€ bruts —
 * sinon utiliser une récompense permettrait d'en regagner une quasi
 * gratuitement.
 */
export function progressionFideliteCommande(
  totalCommande: number,
  reliquatAvant: number = 0,
  tamponsUtilises: number = 0
): ProgressionFidelite {
  const net = Math.max(0, totalCommande - tamponsUtilises * MONTANT_RECOMPENSE);
  const totalApres = reliquatAvant + net;
  const tamponsGagnes = Math.floor(totalApres / SEUIL_TAMPON);
  const reste = totalApres % SEUIL_TAMPON;
  return {
    tamponsGagnes,
    montantProchainTampon: reste === 0 ? SEUIL_TAMPON : SEUIL_TAMPON - reste,
  };
}

/** Sous ce montant restant, le message "encore X€" devient utile ; au-delà, il n'est qu'une distraction trop loin du but. */
export const SEUIL_AFFICHAGE_PROGRESSION = 30;

/**
 * Texte prêt à afficher juste à côté du total (site public et caisse) —
 * jamais le même message vague partout. `null` quand il reste plus de
 * `SEUIL_AFFICHAGE_PROGRESSION` à parcourir et qu'aucune récompense n'est
 * gagnée sur cette commande : annoncer "encore 76,50€" à quelqu'un qui vient
 * de commander pour 10€ n'incite à rien, ça n'affiche qu'à partir du moment
 * où la récompense devient concrètement proche.
 */
export function texteProgressionFidelite({ tamponsGagnes, montantProchainTampon }: ProgressionFidelite): string | null {
  if (tamponsGagnes > 0) {
    return `🎁 Cette commande vous rapporte ${tamponsGagnes * (SEUIL_TAMPON / MONTANT_RECOMPENSE)} tampons ! Encore ${formaterEuros(montantProchainTampon)} pour la récompense suivante.`;
  }
  if (montantProchainTampon > SEUIL_AFFICHAGE_PROGRESSION) {
    return null;
  }
  return `🎁 Encore ${formaterEuros(montantProchainTampon)} pour votre prochaine récompense fidélité.`;
}

export interface SoldeTampons {
  /** Nombre de récompenses disponibles (groupes de 10 tampons / 10€), pas le nombre de tampons. */
  nombre: number;
  /** Date d'expiration de la récompense disponible la plus proche d'expirer (la première consommée, FIFO) — null si aucune récompense disponible. */
  prochaineExpiration: string | null;
}

/** Message prêt à afficher pour le solde de récompenses disponibles d'un client (site public, caisse, email) — utilisable immédiatement comme réduction. */
export function messageFidelite({ nombre, prochaineExpiration }: SoldeTampons): string {
  if (nombre > 0) {
    const montant = formaterEuros(nombre * MONTANT_RECOMPENSE);
    const expiration = prochaineExpiration
      ? ` Le plus proche expire le ${new Date(prochaineExpiration).toLocaleDateString("fr-FR")}.`
      : "";
    return `Vous avez ${montant} de récompense disponible${nombre > 1 ? "s" : ""} à utiliser sur votre prochaine commande !${expiration}`;
  }
  return `Continuez à commander chez 3 Sauces et débloquez ${formaterEuros(MONTANT_RECOMPENSE)} offerts tous les ${formaterEuros(SEUIL_TAMPON)} cumulés !`;
}
