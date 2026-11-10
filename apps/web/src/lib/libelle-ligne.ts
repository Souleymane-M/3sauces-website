import { MONTANT_REDUCTION_SANS_BOISSON, NOM_PRODUIT_MENU_ETUDIANT } from "@/lib/commande-publique/types";

interface LigneMinimale {
  nom: string;
  quantite: number;
  prixUnitaire: number;
  boissonIncluse?: string | null;
  canetteIncluse?: boolean;
  categorie?: string;
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
  const payante = l.canetteIncluse === true && l.nom !== NOM_PRODUIT_MENU_ETUDIANT && l.categorie !== "plat_du_jour";
  return payante
    ? `Boisson : ${l.boissonIncluse} (+${euros(MONTANT_REDUCTION_SANS_BOISSON)})`
    : `Boisson incluse : ${l.boissonIncluse}`;
}

/** "Steak haché ×2, Kebab" — regroupe les doublons d'une liste de suppléments. */
function listeAvecQuantites(noms: string[]): string {
  const comptes = new Map<string, number>();
  for (const n of noms) comptes.set(n, (comptes.get(n) ?? 0) + 1);
  return [...comptes].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ");
}

/**
 * Suppléments payants rattachés à la ligne (viande / sauce en plus), à
 * afficher juste sous le produit — jamais sur une ligne séparée en bas du
 * ticket (demande du patron, 2026-11-03).
 */
export function libelleSupplementsLigne(l: {
  viandesSupplementaires?: string[];
  saucesSupplementaires?: string[];
  oignonsFrits?: boolean;
}): { viandes: string | null; sauces: string | null; oignons: boolean } {
  return {
    viandes: l.viandesSupplementaires?.length ? listeAvecQuantites(l.viandesSupplementaires) : null,
    sauces: l.saucesSupplementaires?.length ? listeAvecQuantites(l.saucesSupplementaires) : null,
    oignons: l.oignonsFrits === true,
  };
}
