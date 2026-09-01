import bcrypt from "bcryptjs";

// Coût bcrypt : 10 rounds est le standard recommandé (bon compromis
// sécurité/latence pour une vérif à chaque connexion caisse/livreur/patron).
const SALT_ROUNDS = 10;

/**
 * Hash un secret (PIN employé/livreur ou mot de passe patron) avant stockage
 * en base. Ne jamais stocker la valeur en clair.
 */
export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

/**
 * Compare un secret en clair (saisi au clavier/pavé numérique) à un hash
 * stocké en base (profils.pin_hash ou profils.mot_de_passe_hash).
 */
export async function verifySecret(
  secret: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}
