import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ImprimanteAdmin, ImprimanteAdminPatch } from "./imprimantes-types";

/**
 * Configuration des 2 imprimantes thermiques (comptoir/cuisine) — cf.
 * migration 20260907120000_imprimantes_et_numero_commande.sql. Ce sont 2
 * lignes fixes créées par la migration elle-même (contrainte `role in
 * ('comptoir','cuisine')` unique) : contrairement à produits/options, pas
 * de créer/supprimer ici, juste lister/modifier l'adresse IP et le port.
 */
function versImprimanteAdmin(i: {
  id: string;
  role: "comptoir" | "cuisine";
  nom: string;
  adresse_ip: string | null;
  port: number;
}): ImprimanteAdmin {
  return {
    id: i.id,
    role: i.role,
    nom: i.nom,
    adresseIp: i.adresse_ip,
    port: i.port,
  };
}

export async function listerImprimantesAdmin(): Promise<ImprimanteAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("imprimantes")
    .select("id, role, nom, adresse_ip, port")
    .order("role", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les imprimantes : ${error.message}`);
  }
  return (data ?? []).map(versImprimanteAdmin);
}

export async function mettreAJourImprimante(id: string, patch: ImprimanteAdminPatch): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const update: { nom?: string; adresse_ip?: string | null; port?: number } = {};
  if (patch.nom !== undefined) update.nom = patch.nom;
  if (patch.adresseIp !== undefined) update.adresse_ip = patch.adresseIp;
  if (patch.port !== undefined) update.port = patch.port;

  const { error } = await supabase.from("imprimantes").update(update).eq("id", id);

  if (error) {
    throw new Error(`Impossible de mettre à jour l'imprimante : ${error.message}`);
  }
}
