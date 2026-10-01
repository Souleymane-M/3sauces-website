/**
 * Normalisation basique d'un numéro de téléphone vers E.164, avec +262
 * (Mayotte) par défaut si aucun indicatif n'est saisi explicitement — un
 * client avec un numéro métropolitain (ou tout autre pays) doit taper son
 * indicatif (+33..., 0033...) pour l'obtenir correctement, jamais deviné
 * automatiquement (Mayotte et la métropole partagent le même format local
 * à 10 chiffres, aucun moyen fiable de les distinguer autrement).
 *
 * Tolère uniquement les erreurs de FORMATAGE qui ne changent aucun chiffre
 * du numéro (espaces/points/tirets/parenthèses, zéro local en trop après un
 * indicatif déjà saisi comme "+262 0639..." — toujours correct à coup sûr).
 * Rejette en revanche tout ce qui touche au NOMBRE de chiffres (un zéro
 * manquant ou en trop, "00" suivi d'un numéro local...) : on ne peut jamais
 * distinguer à coup sûr "un zéro de trop/en moins" d'une autre erreur de
 * saisie ailleurs dans le numéro — deviner ferait courir le risque de
 * sauvegarder silencieusement un numéro tout aussi faux mais qui a l'air
 * valide. Le client doit alors ressaisir son numéro exact.
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
    // "00" suivi d'un numéro qui ressemble à un local Mayotte/métropole à
    // 9 ou 10 chiffres (ex: "00639123456") : rejeté plutôt que deviné. On
    // ne peut pas distinguer à coup sûr "un zéro de trop" d'une autre
    // erreur de saisie (chiffre en trop/en moins ailleurs) — deviner un
    // numéro par défaut ferait courir le risque, une fois sur deux, de
    // sauvegarder silencieusement un numéro tout aussi faux mais qui a
    // l'air valide. Le client doit corriger lui-même (un seul 0, ex:
    // "0639123456"), jamais de correction automatique sur un cas ambigu.
    if (/^0?\d{9}$/.test(reste)) return null;
    if (!/^\d{8,15}$/.test(reste)) return null;
    return `+${reste}`.replace(/^(\+\d{1,3})0(\d{8,9})$/, "$1$2");
  }

  // Numéro local à 10 chiffres commençant par 0 (Mayotte/métropole/DOM,
  // même format) → +262 par défaut.
  if (/^0\d{9}$/.test(nettoye)) {
    return `+262${nettoye.slice(1)}`;
  }

  // 9 chiffres sans le 0 initial (ex: "639123456") : rejeté plutôt que
  // deviné, même raisonnement que pour le cas "00" ci-dessus — un chiffre
  // manquant ailleurs dans le numéro produirait aussi 9 chiffres, et
  // compléter par défaut risquerait de sauvegarder silencieusement un
  // numéro tout aussi faux. Le client doit saisir son numéro exact (10
  // chiffres, ex: "0639123456"), jamais de correction automatique.
  return null;
}
