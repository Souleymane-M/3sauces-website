import { SignJWT, jwtVerify } from "jose";

export type Role = "employe" | "livreur" | "patron";

export interface SessionPayload {
  profilId: string;
  role: Role;
  nom: string;
}

const SESSION_COOKIE_NAME = "3sauces_session";
const SESSION_DURATION = "12h";

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET doit être défini (.env.local) pour signer les sessions."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

/**
 * Vérifie un token de session. Retourne null si absent, expiré ou invalide
 * (signature falsifiée) — ne jamais faire confiance à un payload non vérifié.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.profilId === "string" &&
      typeof payload.role === "string" &&
      typeof payload.nom === "string"
    ) {
      return {
        profilId: payload.profilId,
        role: payload.role as Role,
        nom: payload.nom,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME };
