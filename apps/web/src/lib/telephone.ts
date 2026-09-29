/**
 * Normalisation basique d'un numéro de téléphone vers E.164, avec +262
 * (Mayotte) par défaut si aucun indicatif n'est saisi explicitement — un
 * client avec un numéro métropolitain (ou tout autre pays) doit taper son
 * indicatif (+33..., 0033...) pour l'obtenir correctement, jamais deviné
 * automatiquement (Mayotte et la métropole partagent le même format local
 * à 10 chiffres, aucun moyen fiable de les distinguer autrement).
 *
 * Volontairement tolérante aux erreurs de saisie les plus fréquentes
 * (observées en usage réel) plutôt que de rejeter sèchement :
 *  - parenthèses/espaces multiples autour de l'indicatif ;
 *  - le zéro local en trop après un indicatif déjà saisi (+262 0639...) ;
 *  - le zéro initial oublié (639... au lieu de 0639...).
 */
export function normaliserTelephone(saisie: string): string | null {
  const nettoye = saisie.trim().replace(/[\s.\-()]/g, "");
  if (!nettoye) return null;

  if (nettoye.startsWith("+")) {
    if (!/^\+\d{8,15}$/.test(nettoye)) return null;
    // Erreur de saisie très fréquente : l'indicatif ET le zéro local
    // (ex: +262 0639123456) — le zéro ne se compose jamais après un
    // indicatif international, quel que soit le pays.
    return nettoye.replace(/^(\+\d{1,3})0(\d{8,9})$/, "$1$2");
  }

  if (nettoye.startsWith("00")) {
    const reste = nettoye.slice(2);
    if (!/^\d{8,15}$/.test(reste)) return null;
    return `+${reste}`.replace(/^(\+\d{1,3})0(\d{8,9})$/, "$1$2");
  }

  // Numéro local à 10 chiffres commençant par 0 (Mayotte/métropole/DOM,
  // même format) → +262 par défaut.
  if (/^0\d{9}$/.test(nettoye)) {
    return `+262${nettoye.slice(1)}`;
  }

  // Zéro initial oublié (9 chiffres au lieu de 10) — faute de frappe ou
  // copier-coller courant, on le complète plutôt que de rejeter.
  if (/^\d{9}$/.test(nettoye)) {
    return `+262${nettoye}`;
  }

  return null;
}
