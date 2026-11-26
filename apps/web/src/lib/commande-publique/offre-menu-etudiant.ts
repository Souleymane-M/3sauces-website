import type { LigneCommande } from "@/lib/caisse/types";
import { dateMayotteIso, heureActuelleMayotteMinutes } from "./creneau";
import { NOM_PRODUIT_MENU_ETUDIANT } from "./types";

/**
 * Offre « 3 Menus Étudiants achetés = 1 offert » (4 menus dans le panier, le moins cher est offert), site public uniquement,
 * le vendredi 27/11/2026 pour toute commande passée AVANT 12 h (heure de Mayotte) — demande du patron, 25/11/2026.
 * Aucune base de données : on ajoute les jours concernés à `JOURS_OFFRE_MENU_ETUDIANT`.
 * Règles : aucune autre offre sur la commande (ni canette offerte, ni points de fidélité utilisés ou gagnés) ; l'offre est
 * refusée si le client utilise ses points de fidélité sur la commande (il choisit l'un ou l'autre).
 */
export const JOURS_OFFRE_MENU_ETUDIANT: readonly string[] = ["2026-11-27"];
export const HEURE_LIMITE_MENU_ETUDIANT = 12;
export const MENUS_POUR_UN_OFFERT = 4;

/** Vrai si l'offre est ouverte MAINTENANT (jour concerné à Mayotte, avant l'heure limite). */
export function offreMenuEtudiantOuverte(): boolean {
  return JOURS_OFFRE_MENU_ETUDIANT.includes(dateMayotteIso()) && heureActuelleMayotteMinutes() < HEURE_LIMITE_MENU_ETUDIANT * 60;
}

/** Un menu offert par groupe de 4 menus dans le panier : 4 → 1, 7 → 1, 8 → 2. */
export function nombreMenusOfferts(nbMenus: number): number {
  return Math.floor(nbMenus / MENUS_POUR_UN_OFFERT);
}

/**
 * Applique l'offre aux lignes d'une commande : les menus les MOINS chers (un par groupe de 4) passent à 0 € et sont marqués
 * `offert` ; ils restent des lignes à part entière pour que la cuisine prépare bien tous les menus.
 */
export function offrirMenusEtudiant(lignes: LigneCommande[]): { lignes: LigneCommande[]; nbOfferts: number } {
  const resultat = lignes.map((l) => ({ ...l }));
  const nbMenus = resultat.filter((l) => l.nom === NOM_PRODUIT_MENU_ETUDIANT && !l.offert).reduce((t, l) => t + l.quantite, 0);
  const nbOfferts = nombreMenusOfferts(nbMenus);
  for (let i = 0; i < nbOfferts; i++) {
    let indexMoinsCher = -1;
    resultat.forEach((l, index) => {
      if (l.nom !== NOM_PRODUIT_MENU_ETUDIANT || l.offert || l.quantite < 1) return;
      if (indexMoinsCher === -1 || l.prixUnitaire < resultat[indexMoinsCher].prixUnitaire) indexMoinsCher = index;
    });
    if (indexMoinsCher === -1) break;
    const ligne = resultat[indexMoinsCher];
    if (ligne.quantite === 1) {
      resultat[indexMoinsCher] = { ...ligne, prixUnitaire: 0, offert: true };
    } else {
      ligne.quantite -= 1;
      resultat.splice(indexMoinsCher + 1, 0, { ...ligne, quantite: 1, prixUnitaire: 0, offert: true });
    }
  }
  return { lignes: resultat, nbOfferts };
}
