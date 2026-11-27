/**
 * Visuels de l'offre du jour affichés en haut de l'accueil de 3sauces.fr.
 * Un visuel par jour : on ajoute une ligne (date AAAA-MM-JJ à l'heure de Mayotte) et les deux images dans `public/offres/`.
 * Téléphone (portrait) : le carré ; tablette et ordinateur (paysage) : le format large. Pas de visuel ce jour-là : bandeau texte.
 */
export type VisuelOffre = {
  /** Jour d'affichage (AAAA-MM-JJ, heure de Mayotte). */
  jour: string;
  carre: string;
  paysage: string;
  /** Texte alternatif (lecteurs d'écran, image qui ne charge pas). */
  alt: string;
};

export const VISUELS_OFFRES: readonly VisuelOffre[] = [
  {
    jour: "2026-11-27",
    carre: "/offres/menu-etudiant-2026-11-27-carre.jpg",
    paysage: "/offres/menu-etudiant-2026-11-27-paysage.jpg",
    alt: "Aujourd'hui seulement : 3 Menus Étudiants achetés, le 4ᵉ est offert. Menu Étudiant à 8 € : mini tacos 1 viande, frites et canette. Commande sur 3sauces.fr.",
  },
];

export function visuelOffreDuJour(jour: string): VisuelOffre | null {
  return VISUELS_OFFRES.find((v) => v.jour === jour) ?? null;
}
