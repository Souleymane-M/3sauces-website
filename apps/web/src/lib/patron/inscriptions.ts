import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

export interface InscriptionAdmin {
  id: string;
  email: string;
  accepteOffres: boolean;
  consentementLe: string;
  desinscritLe: string | null;
}

export type CibleEnvoi = "reouverture" | "offres";

/** Toutes les inscriptions, les plus récentes d'abord. */
export async function listerInscriptions(): Promise<InscriptionAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("inscriptions_information")
    .select("id, email, accepte_offres, consentement_le, desinscrit_le")
    .order("consentement_le", { ascending: false });
  if (error) throw new Error(`Impossible de charger les inscriptions : ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    accepteOffres: r.accepte_offres,
    consentementLe: r.consentement_le,
    desinscritLe: r.desinscrit_le,
  }));
}

/**
 * Destinataires autorisés pour un envoi :
 *  - « reouverture » : tous les inscrits NON désinscrits (ils ont demandé à être prévenus) ;
 *  - « offres » : uniquement ceux qui ont coché la case offres ET ne sont pas désinscrits.
 * La règle est ici, côté serveur : l'écran ne peut jamais envoyer des offres à quelqu'un qui ne les a pas acceptées.
 */
export async function listerDestinataires(cible: CibleEnvoi): Promise<{ id: string; email: string; jeton: string }[]> {
  const supabase = createServiceSupabaseClient();
  let requete = supabase
    .from("inscriptions_information")
    .select("id, email, jeton_desinscription")
    .is("desinscrit_le", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (cible === "offres") requete = requete.eq("accepte_offres", true);
  const { data, error } = await requete;
  if (error) throw new Error(`Impossible de charger les destinataires : ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, email: r.email, jeton: r.jeton_desinscription }));
}
