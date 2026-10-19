import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Role, RoleMetier } from "@3sauces/supabase";
import { hashSecret } from "@/lib/auth/crypto";

export interface UtilisateurEquipe {
  id: string;
  nom: string;
  role: Role;
  actif: boolean;
  rolesMetier: RoleMetier[];
}

/** Gestion des comptes depuis le Pilotage — jamais de statistique par personne affichée ailleurs, juste la liste des comptes. */
export async function listerUtilisateurs(): Promise<UtilisateurEquipe[]> {
  const supabase = createServiceSupabaseClient();
  const { data: profils, error } = await supabase.from("profils").select("id, nom, role, actif").order("nom");
  if (error) {
    throw new Error(`Impossible de charger les utilisateurs : ${error.message}`);
  }
  const { data: roles, error: erreurRoles } = await supabase.from("profil_roles").select("profil_id, role_metier");
  if (erreurRoles) {
    throw new Error(`Impossible de charger les rôles : ${erreurRoles.message}`);
  }
  const rolesParProfil = new Map<string, RoleMetier[]>();
  for (const r of roles ?? []) {
    const liste = rolesParProfil.get(r.profil_id) ?? [];
    liste.push(r.role_metier);
    rolesParProfil.set(r.profil_id, liste);
  }
  return (profils ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    role: p.role,
    actif: p.actif,
    rolesMetier: rolesParProfil.get(p.id) ?? [],
  }));
}

/**
 * Crée un compte employé/livreur (le patron se crée différemment, par
 * migration manuelle — pas prévu ici, un seul compte patron existe).
 * Les rôles métier "employe" possibles sont cuisine/comptoir (choisis),
 * "livreur" reçoit automatiquement le rôle "livreur" (1:1, inchangé).
 */
export async function creerUtilisateur({
  nom,
  role,
  pin,
  rolesMetier,
}: {
  nom: string;
  role: "employe" | "livreur";
  pin: string;
  rolesMetier: RoleMetier[];
}): Promise<string> {
  const supabase = createServiceSupabaseClient();
  const pinHash = await hashSecret(pin);

  const { data, error } = await supabase
    .from("profils")
    .insert({ nom: nom.trim(), role, pin_hash: pinHash, actif: true })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Impossible de créer l'utilisateur : ${error?.message ?? "erreur inconnue"}`);
  }

  const rolesAEnregistrer = role === "livreur" ? ["livreur" as const] : rolesMetier;
  if (rolesAEnregistrer.length > 0) {
    const { error: erreurRoles } = await supabase
      .from("profil_roles")
      .insert(rolesAEnregistrer.map((r) => ({ profil_id: data.id, role_metier: r })));
    if (erreurRoles) {
      throw new Error(`Utilisateur créé, mais rôles non enregistrés : ${erreurRoles.message}`);
    }
  }

  return data.id;
}

export async function definirActif(profilId: string, actif: boolean): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("profils").update({ actif }).eq("id", profilId);
  if (error) {
    throw new Error(`Impossible de mettre à jour le compte : ${error.message}`);
  }
}

export async function reinitialiserPin(profilId: string, nouveauPin: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const pinHash = await hashSecret(nouveauPin);
  const { error } = await supabase.from("profils").update({ pin_hash: pinHash }).eq("id", profilId);
  if (error) {
    throw new Error(`Impossible de réinitialiser le PIN : ${error.message}`);
  }
}

/** Remplace entièrement les rôles métier d'un profil "employe" (cuisine/comptoir) — jamais pour un livreur/patron, dont le rôle est 1:1 et fixe. */
export async function definirRolesMetier(profilId: string, rolesMetier: RoleMetier[]): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error: erreurSuppr } = await supabase.from("profil_roles").delete().eq("profil_id", profilId);
  if (erreurSuppr) {
    throw new Error(`Impossible de mettre à jour les rôles : ${erreurSuppr.message}`);
  }
  if (rolesMetier.length === 0) return;
  const { error } = await supabase
    .from("profil_roles")
    .insert(rolesMetier.map((r) => ({ profil_id: profilId, role_metier: r })));
  if (error) {
    throw new Error(`Impossible de mettre à jour les rôles : ${error.message}`);
  }
}
