import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import { envoyerEmail } from "@/lib/notifications/email";
import { normaliserSourceCampagne } from "@/lib/campagne";
import {
  construireHtmlCampagne,
  jetonDesinscription,
  listerClientsRelance,
  personnaliserMessage,
  type ModeRelance,
} from "@/lib/patron/relance";

export interface CampagneAuto {
  jourSemaine: number;
  actif: boolean;
  mode: ModeRelance;
  joursInactivite: number;
  sujet: string;
  message: string;
  etiquette: string;
  dernierEnvoiLe: string | null;
  dernierNbEnvoyes: number | null;
  dernierNbEchecs: number | null;
}

const MODES: readonly ModeRelance[] = ["points", "recompense", "relance", "tous"];
/** Temps maximum d'une exécution (la fonction du site est limitée) : au-delà, la prochaine passe reprend là où elle s'est arrêtée. */
const BUDGET_MS = 240_000;

export function jourSemaineMayotte(): number {
  const jour = new Date(Date.now() + 3 * 3600 * 1000).getUTCDay();
  return jour === 0 ? 7 : jour;
}

export async function listerCampagnesAuto(): Promise<CampagneAuto[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("campagnes_auto").select("*").order("jour_semaine");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    jourSemaine: r.jour_semaine,
    actif: r.actif,
    mode: r.mode,
    joursInactivite: r.jours_inactivite,
    sujet: r.sujet,
    message: r.message,
    etiquette: r.etiquette,
    dernierEnvoiLe: r.dernier_envoi_le,
    dernierNbEnvoyes: r.dernier_nb_envoyes,
    dernierNbEchecs: r.dernier_nb_echecs,
  }));
}

export type EntreeCampagne = Pick<CampagneAuto, "jourSemaine" | "actif" | "mode" | "joursInactivite" | "sujet" | "message" | "etiquette">;

/** Valide et enregistre une campagne ; renvoie un message d'erreur lisible sinon null. */
export async function enregistrerCampagneAuto(e: EntreeCampagne): Promise<string | null> {
  if (![1, 3, 5].includes(e.jourSemaine)) return "Jour invalide.";
  if (!MODES.includes(e.mode)) return "Cible invalide.";
  const sujet = e.sujet.trim();
  const message = e.message.trim();
  const etiquette = normaliserSourceCampagne(e.etiquette.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")) ?? "";
  if (sujet.length > 150 || message.length > 3000) return "Sujet ou message trop long.";
  if (e.actif && (!sujet || !message)) return "Écris un sujet et un message avant d'activer cet envoi.";
  const jours = Math.max(1, Math.min(365, Math.round(e.joursInactivite) || 14));
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("campagnes_auto")
    .update({ actif: e.actif, mode: e.mode, jours_inactivite: jours, sujet, message, etiquette, updated_at: new Date().toISOString() })
    .eq("jour_semaine", e.jourSemaine);
  return error ? error.message : null;
}

export async function toutDesactiver(): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("campagnes_auto").update({ actif: false, updated_at: new Date().toISOString() }).gte("jour_semaine", 1);
  return error ? error.message : null;
}

export interface ResultatExecution {
  statut: "inactif" | "ferme" | "deja_envoye" | "termine" | "partiel";
  envoyes: number;
  echecs: number;
}

/**
 * Exécute la campagne du jour (Mayotte) si elle est active. Idempotente : le journal `campagnes_auto_envois`
 * empêche d'écrire deux fois au même client le même jour, donc une seconde passe reprend ce qui reste.
 */
export async function executerCampagneDuJour(): Promise<ResultatExecution> {
  const supabase = createServiceSupabaseClient();
  const aujourdHui = dateMayotteIso();

  const { data: campagne } = await supabase.from("campagnes_auto").select("*").eq("jour_semaine", jourSemaineMayotte()).maybeSingle();
  if (!campagne || !campagne.actif || !campagne.sujet.trim() || !campagne.message.trim()) return { statut: "inactif", envoyes: 0, echecs: 0 };
  if (campagne.dernier_envoi_le === aujourdHui) return { statut: "deja_envoye", envoyes: 0, echecs: 0 };

  // Jamais de promotion un jour où le site est fermé (interrupteur coupé, ou jour de la semaine fermé).
  const { data: parametres } = await supabase.from("parametres_livraison").select("site_ouvert, jours_fermeture").eq("id", true).maybeSingle();
  if (parametres && (!parametres.site_ouvert || (parametres.jours_fermeture ?? []).includes(new Date(Date.now() + 3 * 3600 * 1000).getUTCDay()))) {
    return { statut: "ferme", envoyes: 0, echecs: 0 };
  }

  const destinataires = await listerClientsRelance(campagne.mode, campagne.jours_inactivite);
  const { data: dejaEnvoyes } = await supabase.from("campagnes_auto_envois").select("email").eq("jour", aujourdHui);
  const dejaFaits = new Set((dejaEnvoyes ?? []).map((r) => r.email.toLowerCase()));
  const etiquette = normaliserSourceCampagne(campagne.etiquette);

  const debut = Date.now();
  let envoyes = 0;
  let echecs = 0;
  let restants = 0;
  for (const c of destinataires) {
    if (dejaFaits.has(c.email.toLowerCase())) continue;
    if (Date.now() - debut > BUDGET_MS) {
      restants++;
      continue;
    }
    try {
      const jeton = await jetonDesinscription(c.email);
      if (!jeton) continue;
      const r = await envoyerEmail(c.email, campagne.sujet, construireHtmlCampagne(personnaliserMessage(campagne.message, c), jeton, etiquette));
      if (r.ok) {
        envoyes++;
        await supabase.from("campagnes_auto_envois").insert({ jour: aujourdHui, email: c.email.toLowerCase() });
      } else {
        echecs++;
      }
    } catch {
      echecs++;
    }
  }

  const totalJour = dejaFaits.size + envoyes;
  if (restants === 0) {
    await supabase
      .from("campagnes_auto")
      .update({ dernier_envoi_le: aujourdHui, dernier_nb_envoyes: totalJour, dernier_nb_echecs: echecs })
      .eq("jour_semaine", campagne.jour_semaine);
  }
  return { statut: restants === 0 ? "termine" : "partiel", envoyes, echecs };
}
