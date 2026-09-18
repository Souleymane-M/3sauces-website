import "server-only";
import { SignJWT, jwtVerify } from "jose";

// Jeton de session fidélité (site public) — secret VOLONTAIREMENT distinct
// d'AUTH_SECRET (sessions employé/livreur/patron) : ce jeton est stocké en
// localStorage côté client (donc exposé à un XSS éventuel), une fuite ne
// doit jamais permettre de forger une session interne.
const DUREE_SESSION_FIDELITE = "30d";
const AUDIENCE_FIDELITE = "fidelite";

function getSecretKey(): Uint8Array {
  const secret = process.env.FIDELITE_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "FIDELITE_SESSION_SECRET doit être défini (.env.local) pour signer les jetons fidélité."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function creerTokenFidelite(telephone: string): Promise<string> {
  return new SignJWT({ telephone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUDIENCE_FIDELITE)
    .setExpirationTime(DUREE_SESSION_FIDELITE)
    .sign(getSecretKey());
}

/**
 * Vérifie un jeton fidélité. Retourne null si absent, expiré ou invalide —
 * ne jamais faire confiance à un payload non vérifié.
 */
export async function verifierTokenFidelite(token: string): Promise<{ telephone: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { audience: AUDIENCE_FIDELITE });
    if (typeof payload.telephone === "string") {
      return { telephone: payload.telephone };
    }
    return null;
  } catch {
    return null;
  }
}

export async function lireTokenFideliteDepuisHeader(request: Request): Promise<string | null> {
  const entete = request.headers.get("authorization") ?? "";
  const [type, token] = entete.split(" ");
  if (type !== "Bearer" || !token) {
    return null;
  }
  const payload = await verifierTokenFidelite(token);
  return payload?.telephone ?? null;
}
