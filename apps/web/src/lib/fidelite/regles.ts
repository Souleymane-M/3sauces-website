// Règles et copie du programme de fidélité — source unique, réutilisée par
// la caisse, le site public et les emails, pour ne jamais afficher deux
// messages différents pour la même situation.
//
// IMPORTANT : l'accumulation se fait sur l'ensemble des commandes d'un
// client (comptoir + livraison + site), jamais par commande individuelle —
// ne jamais écrire "10€ minimum par commande pour un tampon", c'est faux.
//
// RÈGLE DU PROGRAMME (ne jamais confondre ces deux montants) :
// 10€ dépensés = 1 tampon (simple marqueur de progression).
// 10 tampons (donc 100€ cumulés) = 1 tampon RÉCOMPENSE de 10€, individuel,
// expirable 3 mois après son obtention, utilisable par tranche (le client
// n'est jamais obligé de tout dépenser d'un coup), consommé du plus proche
// de l'expiration en premier (FIFO). Un tampon-récompense ne vaut donc
// JAMAIS 10€ tous les 10€ dépensés — uniquement tous les 100€. Une erreur
// sur ce point le 2026-10-06 a fait miner un tampon-récompense tous les
// 10€ au lieu de 100€ (10x trop généreux), corrigée le 2026-10-07 —
// voir supabase/migrations/20261007090000_corrige_seuil_tampon_fidelite.sql.

export const MONTANT_RECOMPENSE = 10;
/** Montant cumulé nécessaire pour qu'un tampon-récompense se forme — jamais confondre avec MONTANT_RECOMPENSE (sa valeur une fois obtenu). */
export const SEUIL_TAMPON = 100;
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
 * cette même commande. Un tampon se forme tous les SEUIL_TAMPON (100€)
 * cumulés, jamais tous les MONTANT_RECOMPENSE (10€, qui est seulement sa
 * valeur une fois formé).
 *
 * Seul le montant réellement payé en plus des tampons utilisés compte :
 * une commande de 20€ qui utilise 1 tampon (10€) ne doit faire gagner de
 * nouveau tampon que sur ces 10€ net, jamais sur les 20€ bruts — sinon
 * utiliser une récompense permettrait d'en regagner une quasi gratuitement.
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
  return `Continuez à commander chez 3 Sauces et gagnez ${formaterEuros(MONTANT_RECOMPENSE)} offerts tous les ${formaterEuros(SEUIL_TAMPON)} cumulés !`;
}
