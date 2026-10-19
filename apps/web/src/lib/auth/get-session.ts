import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type Role, type SessionPayload } from "./session";
import type { RoleMetier } from "./roles-metier";

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

/**
 * Même principe que `requireRole`, mais sur les rôles métier (cuisine,
 * comptoir, livreur, patron) de l'interface équipe unifiée — un profil
 * "employe" peut cumuler cuisine ET comptoir, `requireRole` seul ne peut
 * pas exprimer ça. Le patron garde l'accès à tout.
 */
export async function requireRoleMetier(
  allowedRolesMetier: RoleMetier[]
): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "patron") return session;
  if (session.rolesMetier.some((r) => allowedRolesMetier.includes(r))) return session;
  return null;
}
