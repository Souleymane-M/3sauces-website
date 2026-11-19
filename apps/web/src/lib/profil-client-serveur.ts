import "server-only";
import type { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ProfilClient } from "@/lib/profil-client";

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Enregistre le profil d'un client. Sans erreur bloquante : tant que la migration « profil_client » n'est pas passée
 * dans Supabase (colonne absente), l'échec est ignoré et la commande n'est jamais bloquée.
 */
export async function enregistrerProfilClient(supabase: Supabase, telephone: string, profil: ProfilClient | null): Promise<void> {
  if (!profil) return;
  try {
    const { error } = await supabase
      .from("clients")
      .update({ profil, profil_renseigne_le: new Date().toISOString() } as never)
      .eq("telephone", telephone);
    if (error) console.error("[profil client] enregistrement impossible :", error.message);
  } catch (e) {
    console.error("[profil client] enregistrement impossible :", e);
  }
}

/** Profil déjà enregistré pour ce numéro (null si inconnu, ou si la colonne n'existe pas encore). */
export async function lireProfilEnregistre(supabase: Supabase, telephone: string): Promise<ProfilClient | null> {
  try {
    const { data, error } = await supabase.from("clients").select("profil" as never).eq("telephone", telephone).maybeSingle();
    if (error || !data) return null;
    return ((data as unknown as { profil?: ProfilClient | null }).profil ?? null) as ProfilClient | null;
  } catch {
    return null;
  }
}
