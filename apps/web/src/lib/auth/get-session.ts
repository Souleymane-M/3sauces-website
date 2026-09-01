import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type Role, type SessionPayload } from "./session";

/**
 * Lit et vérifie la session courante depuis le cookie httpOnly.
 * À utiliser uniquement dans des Server Components / route handlers.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Vérifie que la session courante a un rôle autorisé pour la page appelante.
 * Le patron a accès à tout (supervision), les autres rôles sont cloisonnés.
 */
export async function requireRole(
  allowedRoles: Role[]
): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "patron") return session;
  if (allowedRoles.includes(session.role)) return session;
  return null;
}
