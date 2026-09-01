/**
 * Normalisation basique d'un numéro de téléphone vers E.164, avec +262
 * (Mayotte) par défaut si aucun indicatif n'est saisi. Volontairement simple
 * (pas de lib externe) — à muscler si on doit un jour gérer d'autres pays.
 */
export function normaliserTelephone(saisie: string): string | null {
  const nettoye = saisie.trim().replace(/[\s.-]/g, "");
  if (!nettoye) return null;

  if (nettoye.startsWith("+")) {
    return /^\+\d{8,15}$/.test(nettoye) ? nettoye : null;
  }

  if (nettoye.startsWith("00")) {
    const reste = nettoye.slice(2);
    return /^\d{8,15}$/.test(reste) ? `+${reste}` : null;
  }

  // Numéro local à 10 chiffres commençant par 0 (Mayotte/France) → +262/+33.
  if (/^0\d{9}$/.test(nettoye)) {
    return `+262${nettoye.slice(1)}`;
  }

  return null;
}
