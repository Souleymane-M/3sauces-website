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
