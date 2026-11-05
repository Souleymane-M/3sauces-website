/**
 * Texte exact affiché à côté de la case « offres » au moment de l'inscription — enregistré avec chaque
 * inscription comme preuve du consentement (RGPD). À incrémenter (V2...) si le texte change.
 */
export const TEXTE_CONSENTEMENT_V1 =
  "V1 — Je souhaite être prévenu(e) par email de la réouverture de 3 Sauces. [Case optionnelle, décochée par défaut :] Je souhaite aussi recevoir les offres et actualités de 3 Sauces par email. Je peux me désinscrire à tout moment.";

const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jetonValide(jeton: unknown): jeton is string {
  return typeof jeton === "string" && FORME_UUID.test(jeton);
}
