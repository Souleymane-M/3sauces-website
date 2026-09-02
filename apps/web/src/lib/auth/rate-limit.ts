import "server-only";

// Anti-bruteforce basique pour les endpoints PIN/mot de passe.
// LIMITE CONNUE : stockage en mémoire du process — repart à zéro à chaque
// redéploiement/redémarrage, et ne fonctionne pas s'il y a plusieurs instances
// serveur en parallèle. Suffisant pour un seul restaurant sur une instance
// unique ; à remplacer par un compteur partagé (ex: table Postgres dédiée ou
// Redis) si l'app est un jour déployée sur plusieurs instances.
const MAX_TENTATIVES = 5;
const FENETRE_MS = 5 * 60 * 1000; // 5 minutes

interface Compteur {
  tentatives: number;
  reinitialiseA: number;
}

const compteurs = new Map<string, Compteur>();

export function estBloque(cle: string): boolean {
  const compteur = compteurs.get(cle);
  if (!compteur) return false;
  if (Date.now() > compteur.reinitialiseA) {
    compteurs.delete(cle);
    return false;
  }
  return compteur.tentatives >= MAX_TENTATIVES;
}

export function enregistrerEchec(cle: string): void {
  const existant = compteurs.get(cle);
  if (!existant || Date.now() > existant.reinitialiseA) {
    compteurs.set(cle, { tentatives: 1, reinitialiseA: Date.now() + FENETRE_MS });
    return;
  }
  existant.tentatives += 1;
}

export function reinitialiser(cle: string): void {
  compteurs.delete(cle);
}

/**
 * Anti-spam générique pour les endpoints publics non authentifiés (ex:
 * création de commande) : contrairement à `estBloque`/`enregistrerEchec`
 * (qui ne comptent que les échecs de connexion), ceci compte CHAQUE appel,
 * réussi ou non, pour limiter le débit brut par clé (ex: IP). Mêmes limites
 * connues que ci-dessus (mémoire process, mono-instance).
 */
export function limiterDebit(cle: string, max: number, fenetreMs: number): boolean {
  const maintenant = Date.now();
  const existant = compteurs.get(cle);

  if (!existant || maintenant > existant.reinitialiseA) {
    compteurs.set(cle, { tentatives: 1, reinitialiseA: maintenant + fenetreMs });
    return false;
  }

  existant.tentatives += 1;
  return existant.tentatives > max;
}
