/**
 * Validation minimale mais stricte : rejette plutôt que de deviner, même
 * philosophie que `normaliserTelephone`. Pas de vérification de domaine
 * réel (hors de portée côté serveur sans envoi), juste la forme générale.
 */
const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliserEmail(saisie: string): string | null {
  const nettoye = saisie.trim().toLowerCase();
  if (!nettoye || !FORME_EMAIL.test(nettoye)) return null;
  return nettoye;
}
