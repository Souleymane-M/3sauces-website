// Règles et copie du programme de fidélité — source unique, réutilisée par
// la caisse et le site public, pour ne jamais afficher deux messages
// différents pour la même situation.
//
// IMPORTANT : l'accumulation se fait sur l'ensemble des commandes d'un
// client (comptoir + livraison + site), jamais par commande individuelle —
// ne jamais écrire "10€ minimum par commande pour un tampon", c'est faux.

export const MONTANT_RECOMPENSE = 10;
export const SEUIL_RECOMPENSE = 100;
export const SEUIL_AFFICHAGE_EXACT = 70;
export const TAGLINE_FIDELITE = "Chaque euro compte chez 3 Sauces";

export function formaterEuros(montant: number): string {
  const arrondi = Math.round(montant * 100) / 100;
  const texte = Number.isInteger(arrondi) ? arrondi.toString() : arrondi.toFixed(2).replace(".", ",");
  return `${texte}€`;
}

export interface ProgressionFidelite {
  /** Nombre de tampons que cette commande fait gagner (0 si le montant ne complète aucun tampon). */
  tamponsGagnes: number;
  /** Montant restant à ajouter pour obtenir un tampon de plus. */
  montantProchainTampon: number;
}

/**
 * Calcule ce qu'une commande apporte en tampons — à partir du montant cumulé
 * juste avant cette commande (0 si inconnu, ex: client non identifié sur le
 * site public : le calcul devient alors une simple estimation sur le panier,
 * jamais le vrai solde, qu'on ne peut pas connaître sans lui demander son
 * numéro).
 */
export function progressionFideliteCommande(totalCommande: number, montantCumuleAvant: number = 0): ProgressionFidelite {
  const tamponsAvant = Math.floor(montantCumuleAvant / MONTANT_RECOMPENSE);
  const montantApres = montantCumuleAvant + totalCommande;
  const tamponsApres = Math.floor(montantApres / MONTANT_RECOMPENSE);
  const reste = montantApres % MONTANT_RECOMPENSE;
  return {
    tamponsGagnes: tamponsApres - tamponsAvant,
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

export function messageFidelite({
  montantCumule,
  recompenseDisponible,
}: {
  montantCumule: number;
  recompenseDisponible: boolean;
}): string {
  if (recompenseDisponible) {
    return "Votre récompense de 10€ est disponible ! Utilisez-la sur cette commande.";
  }
  if (montantCumule > SEUIL_AFFICHAGE_EXACT) {
    return `Plus que ${formaterEuros(SEUIL_RECOMPENSE - montantCumule)} pour votre récompense de 10€ !`;
  }
  return "Continuez à commander chez 3 Sauces et gagnez 10€ offerts !";
}
