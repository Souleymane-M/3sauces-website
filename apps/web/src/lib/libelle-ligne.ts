import { MONTANT_REDUCTION_SANS_BOISSON, NOM_PRODUIT_MENU_ETUDIANT } from "@/lib/commande-publique/types";

interface LigneMinimale {
  nom: string;
  quantite: number;
  prixUnitaire: number;
  boissonIncluse?: string | null;
  canetteIncluse?: boolean;
}

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Sur Tacos, Barquette et Bowl, la boisson se paie en plus du plat (+1,50 €,
 * déjà comprise dans le prix de la ligne) : "incluse" prêtait à confusion,
 * le client et le livreur ne savaient pas si le prix était celui du plat seul
 * ou avec boisson (demande du patron, 2026-10-27).
 */
export function libelleBoissonLigne(l: LigneMinimale): string | null {
  if (!l.boissonIncluse) return null;
  const payante = l.canetteIncluse === true && l.nom !== NOM_PRODUIT_MENU_ETUDIANT;
  return payante
    ? `Boisson : ${l.boissonIncluse} (+${euros(MONTANT_REDUCTION_SANS_BOISSON)})`
    : `Boisson incluse : ${l.boissonIncluse}`;
}

/** "9,50 € pièce" dès qu'il y a plusieurs exemplaires, sinon rien (le prix de la ligne suffit). */
export function libellePrixUnitaire(l: LigneMinimale): string | null {
  return l.quantite > 1 ? `${euros(l.prixUnitaire)} pièce` : null;
}
