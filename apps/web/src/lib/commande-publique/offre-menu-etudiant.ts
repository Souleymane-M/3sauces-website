import type { LigneCommande } from "@/lib/caisse/types";
import { dateMayotteIso, heureActuelleMayotteMinutes } from "./creneau";
import { NOM_PRODUIT_MENU_ETUDIANT } from "./types";

/**
 * Offre « 3 Menus Étudiants achetés = 1 offert » (4 menus dans le panier, réduction de 8 € par groupe de 4), site public
 * uniquement, pour toute commande passée du jeudi 26/11/2026 dès 16 h au vendredi 27/11/2026 inclus (heure de Mayotte) —
 * demande du patron, 26/11/2026. Aucune base de données : on ajoute les plages à `PLAGES_OFFRE_MENU_ETUDIANT`.
 * Règles : aucune autre offre sur la commande (ni canette offerte, ni points de fidélité utilisés ou gagnés) ; l'offre est
 * refusée si le client utilise ses points de fidélité sur la commande (il choisit l'un ou l'autre).
 */
export const PLAGES_OFFRE_MENU_ETUDIANT: readonly { jour: string; debutHeure: number; finHeure: number }[] = [
  { jour: "2026-11-26", debutHeure: 16, finHeure: 24 },
  { jour: "2026-11-27", debutHeure: 0, finHeure: 24 },
];
export const MENUS_POUR_UN_OFFERT = 4;
/** Réduction fixe accordée par menu offert (prix du Menu Étudiant) : 8 € par groupe de 4 menus, jamais plus. */
export const REDUCTION_MENU_OFFERT = 8;

/** Vrai si l'offre est ouverte MAINTENANT (heure de Mayotte). */
export function offreMenuEtudiantOuverte(): boolean {
  const jour = dateMayotteIso();
  const minutes = heureActuelleMayotteMinutes();
  return PLAGES_OFFRE_MENU_ETUDIANT.some((p) => p.jour === jour && minutes >= p.debutHeure * 60 && minutes < p.finHeure * 60);
}

/** Un menu offert par groupe de 4 menus dans le panier : 4 → 1, 7 → 1, 8 → 2. */
export function nombreMenusOfferts(nbMenus: number): number {
  return Math.floor(nbMenus / MENUS_POUR_UN_OFFERT);
}

/**
 * Applique l'offre aux lignes d'une commande : les menus les MOINS chers (un par groupe de 4) perdent 8 € (donc 0 € pour un menu simple) et sont marqués
 * `offert` (réduction fixe de 8 €) ; ils restent des lignes à part entière pour que la cuisine prépare bien tous les menus.
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
    const prixApresReduction = Math.round(Math.max(0, ligne.prixUnitaire - REDUCTION_MENU_OFFERT) * 100) / 100;
    if (ligne.quantite === 1) {
      resultat[indexMoinsCher] = { ...ligne, prixUnitaire: prixApresReduction, offert: true };
    } else {
      ligne.quantite -= 1;
      resultat.splice(indexMoinsCher + 1, 0, { ...ligne, quantite: 1, prixUnitaire: prixApresReduction, offert: true });
    }
  }
  return { lignes: resultat, nbOfferts };
}
