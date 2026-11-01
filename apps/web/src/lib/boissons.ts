/** Familles de boissons : canettes 33cl, boissons 2L, boissons 50cl, eau (cf. produits.famille_boisson). */
export type FamilleBoisson = "canette" | "boisson_2l" | "boisson_50cl" | "eau";

export const FAMILLES_BOISSON: { valeur: FamilleBoisson; libelle: string }[] = [
  { valeur: "canette", libelle: "Canettes 33cl" },
  { valeur: "boisson_2l", libelle: "Boissons 2L" },
  { valeur: "boisson_50cl", libelle: "Boissons 50cl" },
  { valeur: "eau", libelle: "Eau" },
];

export function familleBoissonValide(valeur: unknown): valeur is FamilleBoisson {
  return FAMILLES_BOISSON.some((f) => f.valeur === valeur);
}

export function libelleFamilleBoisson(valeur: FamilleBoisson | null): string {
  return FAMILLES_BOISSON.find((f) => f.valeur === valeur)?.libelle ?? "À classer";
}
