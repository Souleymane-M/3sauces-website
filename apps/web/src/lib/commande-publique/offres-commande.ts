import type { LigneCommande } from "@/lib/caisse/types";
import { offreCanetteActive } from "./offre-canette";
import { offreCadeauActive } from "./offre-cadeau";
import { offreMenuEtudiantOuverte } from "./offre-menu-etudiant";
import { BOISSON_2L_OFFERTE_ACTIVE } from "./groupe-priorite";

/**
 * Suivi des offres d'une commande du site (mesure de leur effet, demande du patron, 27/11/2026) :
 * - disponibles : offres ouvertes pour cette commande, déclenchées ou non par le panier ;
 * - appliquees : offres réellement déclenchées, déduites des lignes de la commande ;
 * - nbCanettesOffertes : canettes offertes sur la commande.
 */
export function suiviOffresCommande(
  lignes: LigneCommande[],
  dateService: string
): { disponibles: string[]; appliquees: string[]; nbCanettesOffertes: number } {
  const disponibles: string[] = [];
  if (offreCanetteActive(dateService)) disponibles.push("canette");
  if (offreCadeauActive(dateService)) disponibles.push("box");
  if (BOISSON_2L_OFFERTE_ACTIVE) disponibles.push("boisson_2l");
  if (offreMenuEtudiantOuverte()) disponibles.push("menu_etudiant");

  const canettes = lignes.filter((l) => l.nom.includes("(offerte — offre du jour)"));
  const appliquees: string[] = [];
  if (canettes.length > 0) appliquees.push("canette");
  if (lignes.some((l) => l.nom.startsWith("BOX OFFERTE"))) appliquees.push("box");
  if (lignes.some((l) => l.nom.includes("(offerte — commande groupée)"))) appliquees.push("boisson_2l");
  if (lignes.some((l) => l.offert === true)) appliquees.push("menu_etudiant");
  return { disponibles, appliquees, nbCanettesOffertes: canettes.reduce((t, l) => t + l.quantite, 0) };
}
