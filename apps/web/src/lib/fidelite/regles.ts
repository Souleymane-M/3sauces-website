// Règles et copie du programme de fidélité — source unique, réutilisée par
// la caisse, le site public et les emails, pour ne jamais afficher deux
// messages différents pour la même situation.
//
// IMPORTANT : l'accumulation se fait sur l'ensemble des commandes d'un
// client (comptoir + livraison + site), jamais par commande individuelle —
// ne jamais écrire "10€ minimum par commande pour un tampon", c'est faux.
//
// Depuis la refonte du 2026-10-06 : chaque tranche de 10€ est un tampon
// individuel (sa propre expiration à 3 mois), pas un seul cycle 0-100€.
// Un client peut en cumuler autant qu'il veut et les dépenser par tranche
// de 10€, pas forcément tous d'un coup.

export const MONTANT_RECOMPENSE = 10;
export const TAGLINE_FIDELITE = "Chaque euro compte chez 3 Sauces";

export function formaterEuros(montant: number): string {
  const arrondi = Math.round(montant * 100) / 100;
  const texte = Number.isInteger(arrondi) ? arrondi.toString() : arrondi.toFixed(2).replace(".", ",");
  return `${texte}€`;
}

export interface ProgressionFidelite {
  /** Nombre de nouveaux tampons que cette commande fait gagner (jamais sur le montant brut si des tampons sont utilisés, cf. nouveauxTamponsGagnes). */
  tamponsGagnes: number;
  /** Montant restant à ajouter pour obtenir un tampon de plus. */
  montantProchainTampon: number;
}

/**
 * Calcule ce qu'une commande apporte en NOUVEAUX tampons — à partir du
 * reliquat juste avant cette commande (0 si inconnu, ex: client non
 * identifié sur le site public) et du nombre de tampons utilisés sur
 * cette même commande.
 *
 * Seul le montant réellement payé en plus des tampons utilisés compte :
 * une commande de 20€ qui utilise 1 tampon (10€) ne doit faire gagner
 * qu'1 nouveau tampon, jamais 2 (sur les 20€ bruts) — sinon utiliser une
 * récompense permettrait d'en regagner une quasi gratuitement.
 */
export function progressionFideliteCommande(
  totalCommande: number,
  reliquatAvant: number = 0,
  tamponsUtilises: number = 0
): ProgressionFidelite {
  const net = Math.max(0, totalCommande - tamponsUtilises * MONTANT_RECOMPENSE);
  const totalApres = reliquatAvant + net;
  const tamponsGagnes = Math.floor(totalApres / MONTANT_RECOMPENSE);
  const reste = totalApres % MONTANT_RECOMPENSE;
  return {
    tamponsGagnes,
    montantProchainTampon: reste === 0 ? MONTANT_RECOMPENSE : MONTANT_RECOMPENSE - reste,
  };
}

/** Texte prêt à afficher juste à côté du total (site public et caisse) — jamais le même message vague partout. */
export function texteProgressionFidelite({ tamponsGagnes, montantProchainTampon }: ProgressionFidelite): string {
  if (tamponsGagnes > 0) {
    return `🎁 Cette commande vous rapporte ${tamponsGagnes} tampon${tamponsGagnes > 1 ? "s" : ""} ! Encore ${formaterEuros(montantProchainTampon)} pour le suivant.`;
  }
  return `🎁 Encore ${formaterEuros(montantProchainTampon)} pour votre prochain tampon fidélité.`;
}

export interface SoldeTampons {
  nombre: number;
  /** Date d'expiration du tampon disponible le plus proche d'expirer (le premier consommé, FIFO) — null si aucun tampon disponible. */
  prochaineExpiration: string | null;
}

/** Message prêt à afficher pour le solde de tampons d'un client (site public, caisse, email). */
export function messageFidelite({ nombre, prochaineExpiration }: SoldeTampons): string {
  if (nombre > 0) {
    const montant = formaterEuros(nombre * MONTANT_RECOMPENSE);
    const expiration = prochaineExpiration
      ? ` Le plus proche expire le ${new Date(prochaineExpiration).toLocaleDateString("fr-FR")}.`
      : "";
    return `Vous avez ${nombre} tampon${nombre > 1 ? "s" : ""} disponible${nombre > 1 ? "s" : ""} (${montant}) !${expiration}`;
  }
  return `Continuez à commander chez 3 Sauces et gagnez ${formaterEuros(MONTANT_RECOMPENSE)} offerts tous les ${formaterEuros(MONTANT_RECOMPENSE)} cumulés !`;
}
