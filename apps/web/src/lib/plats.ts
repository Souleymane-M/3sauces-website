/**
 * Seuil à partir duquel une commande livraison devient prioritaire
 * (badge "PRIORITAIRE 🚀" en cuisine/livreur, mise en avant côté client).
 * Volontairement pas de colonne "prioritaire" en base : toujours dérivé
 * à la volée de `nb_plats` pour ne jamais avoir à migrer si ce seuil
 * change un jour.
 */
export const SEUIL_COMMANDE_PRIORITAIRE = 3;

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
