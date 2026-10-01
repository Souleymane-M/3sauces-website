/**
 * Seuil à partir duquel une commande livraison devient prioritaire
 * (badge "PRIORITAIRE 🚀" en cuisine/livreur, mise en avant côté client).
 * Volontairement pas de colonne "prioritaire" en base : toujours dérivé
 * à la volée de `nb_plats` pour ne jamais avoir à migrer si ce seuil
 * change un jour. Un BONUS, jamais une condition pour pouvoir valider —
 * cf. `SEUIL_MINIMUM_GROUPE` ci-dessous pour ça.
 */
export const SEUIL_COMMANDE_PRIORITAIRE = 3;

/**
 * Nombre minimum de plats pour pouvoir valider une commande en mode
 * "Commande groupée" (en dessous, le client doit repasser en "Commande
 * simple"). Distinct de `SEUIL_COMMANDE_PRIORITAIRE` : ce seuil-ci ne
 * débloque qu'un bonus (livraison prioritaire), il ne doit jamais bloquer
 * la validation elle-même. Avant cette distinction, les deux seuils
 * étaient confondus et un client à 2 personnes ne pouvait pas du tout
 * valider sa commande groupée — corrigé le 2026-10-01.
 */
export const SEUIL_MINIMUM_GROUPE = 2;

export interface LigneAvecPlat {
  platIndex: number | null;
}

/**
 * Nombre de plats-conteneurs distincts explicitement créés par le client
 * (mode "Commande groupée") — 0 si aucune ligne n'a de `platIndex` (mode
 * "Commande simple"). Le regroupement est entièrement déclaratif : c'est
 * le client (ou l'employé en mode téléphone) qui décide dans quel plat va
 * chaque article, jamais une classification automatique par catégorie.
 */
export function compterPlatsGroupes<T extends LigneAvecPlat>(lignes: T[]): number {
  const indices = new Set(lignes.filter((l) => l.platIndex !== null).map((l) => l.platIndex));
  return indices.size;
}

/**
 * Montant minimum pour qu'un plat compte comme un vrai repas en mode
 * "Commande groupée" — une grillade seule à 2€ n'en est pas un. Aligné
 * sur le Menu Collégien, le plus petit vrai repas de la carte.
 */
export const SEUIL_MINIMUM_PLAT = 5;

export interface LigneAvecPlatEtPrix extends LigneAvecPlat {
  prixUnitaire: number;
  quantite: number;
}

/** Total en euros de chaque plat-conteneur, regroupé par `platIndex` — jamais confiance dans un total envoyé par le client, toujours recalculé côté serveur à partir de lignes déjà validées. */
export function totauxParPlat<T extends LigneAvecPlatEtPrix>(lignes: T[]): Map<number, number> {
  const totaux = new Map<number, number>();
  for (const l of lignes) {
    if (l.platIndex === null) continue;
    totaux.set(l.platIndex, (totaux.get(l.platIndex) ?? 0) + l.prixUnitaire * l.quantite);
  }
  return totaux;
}
