/**
 * Étiquette de campagne (`?src=email-lundi-points`, `?src=whatsapp-vendredi`…) : lue à l'arrivée sur le site,
 * gardée 7 jours dans le navigateur, envoyée avec la commande. Jamais de donnée personnelle : seulement une
 * étiquette courte choisie par le patron.
 */
export const CLE_SOURCE_CAMPAGNE = "3sauces-source";
export const DUREE_SOURCE_CAMPAGNE_MS = 7 * 24 * 3600 * 1000;

const FORMAT = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function normaliserSourceCampagne(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const v = valeur.trim().toLowerCase();
  return FORMAT.test(v) ? v : null;
}
