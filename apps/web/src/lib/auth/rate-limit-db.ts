import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

/**
 * Anti-bruteforce PIN/mot de passe partagé entre toutes les instances
 * (cf. `tentatives_connexion`) — remplace l'ancien compteur en mémoire du
 * process (`rate-limit.ts`, `estBloque`/`enregistrerEchec`), qui repart à
 * zéro à chaque redémarrage/instance sur Vercel et ne protège donc pas
 * réellement contre le bruteforce en production.
 *
 * Accepte une course bénigne entre deux échecs quasi simultanés (lire puis
 * écrire, pas de verrou) : au pire un essai de plus est toléré, jamais un
 * blocage en moins — même niveau de rigueur que l'ancien compteur.
 */
export async function estBloqueDb(cle: string, maxTentatives: number): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("tentatives_connexion").select("tentatives, reinitialise_a").eq("cle", cle).maybeSingle();
  if (!data) return false;
  if (new Date(data.reinitialise_a).getTime() < Date.now()) return false;
  return data.tentatives >= maxTentatives;
}

export async function enregistrerEchecDb(cle: string, fenetreMs: number): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("tentatives_connexion").select("tentatives, reinitialise_a").eq("cle", cle).maybeSingle();

  const maintenant = Date.now();
  if (!data || new Date(data.reinitialise_a).getTime() < maintenant) {
    await supabase
      .from("tentatives_connexion")
      .upsert({ cle, tentatives: 1, reinitialise_a: new Date(maintenant + fenetreMs).toISOString() });
    return;
  }

  await supabase
    .from("tentatives_connexion")
    .update({ tentatives: data.tentatives + 1 })
    .eq("cle", cle);
}

export async function reinitialiserDb(cle: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  await supabase.from("tentatives_connexion").delete().eq("cle", cle);
}
