import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { ajouterJoursIso, dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import { totalBilletage, type EtatTiroir, type MouvementCaisse } from "./tiroir-types";

type Ligne = {
  id: string;
  type: "ouverture" | "sortie" | "cloture";
  montant: number;
  motif: string | null;
  attendu: number | null;
  ecart: number | null;
  created_at: string;
  annule_le: string | null;
  profils: { nom: string } | null;
};

const SELECT = "id, type, montant, motif, attendu, ecart, created_at, annule_le, profils!mouvements_caisse_profil_id_fkey(nom)";

function versMouvement(l: Ligne): MouvementCaisse {
  return {
    id: l.id,
    type: l.type,
    montant: Number(l.montant),
    motif: l.motif,
    attendu: l.attendu === null ? null : Number(l.attendu),
    ecart: l.ecart === null ? null : Number(l.ecart),
    profilNom: l.profils?.nom ?? null,
    creeLe: l.created_at,
    annule: l.annule_le !== null,
  };
}

/** Lignes (annulées incluses) d'un jour Mayotte, dans l'ordre chronologique. */
export async function listerMouvementsJour(date: string): Promise<MouvementCaisse[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("mouvements_caisse")
    .select(SELECT)
    .eq("date_jour", date)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Lecture du tiroir impossible : ${error.message}`);
  return ((data ?? []) as unknown as Ligne[]).map(versMouvement);
}

export async function chargerEtatTiroir(date: string = dateMayotteIso()): Promise<EtatTiroir> {
  const lignes = (await listerMouvementsJour(date)).filter((m) => !m.annule);
  return {
    date,
    ouverture: lignes.find((m) => m.type === "ouverture") ?? null,
    cloture: lignes.find((m) => m.type === "cloture") ?? null,
    sorties: lignes.filter((m) => m.type === "sortie"),
  };
}

export interface EspecesAttendues {
  encaisseEspeces: number;
  /** Commandes payées en "mixte" sans détail espèces/CB enregistré : leur part espèces est inconnue. */
  mixteSansDetail: number;
}

/** Espèces réellement entrées dans le tiroir sur un jour Mayotte (jamais le jour UTC). */
export async function calculerEspecesEncaissees(date: string): Promise<EspecesAttendues> {
  const supabase = createServiceSupabaseClient();
  const { debut, fin } = plageJourMayotteUtc(date);

  const { data: paiements, error } = await supabase
    .from("paiements")
    .select("montant, commandes!inner(paiement_statut)")
    .eq("mode", "especes")
    .eq("commandes.paiement_statut", "paye")
    .gte("created_at", debut.toISOString())
    .lt("created_at", fin.toISOString());
  if (error) throw new Error(`Lecture des paiements impossible : ${error.message}`);
  let encaisse = (paiements ?? []).reduce((somme, p) => somme + Number(p.montant), 0);

  // Filet pour les commandes payées sans ligne `paiements` (remises au
  // comptoir avant le correctif du 2026-10-25) : on retombe sur le montant
  // de la commande, daté de son dernier changement de statut.
  const { data: sansLigne, error: erreurSansLigne } = await supabase
    .from("commandes")
    .select("id, montant, mode_paiement, paiements(id)")
    .eq("paiement_statut", "paye")
    .in("mode_paiement", ["especes", "mixte"])
    .gte("statut_change_le", debut.toISOString())
    .lt("statut_change_le", fin.toISOString());
  if (erreurSansLigne) throw new Error(`Lecture des commandes impossible : ${erreurSansLigne.message}`);

  let mixteSansDetail = 0;
  for (const c of (sansLigne ?? []) as unknown as { montant: number; mode_paiement: string; paiements: { id: string }[] }[]) {
    if (c.paiements.length > 0) continue;
    if (c.mode_paiement === "especes") encaisse += Number(c.montant);
    else mixteSansDetail += 1;
  }
  return { encaisseEspeces: Math.round(encaisse * 100) / 100, mixteSansDetail };
}

export interface BilanTiroir {
  fonds: number | null;
  encaisseEspeces: number;
  sorties: number;
  attendu: number;
  mixteSansDetail: number;
}

export async function calculerBilanTiroir(date: string, etat?: EtatTiroir): Promise<BilanTiroir> {
  const e = etat ?? (await chargerEtatTiroir(date));
  const { encaisseEspeces, mixteSansDetail } = await calculerEspecesEncaissees(date);
  const sorties = e.sorties.reduce((s, m) => s + m.montant, 0);
  const fonds = e.ouverture?.montant ?? null;
  const attendu = Math.round(((fonds ?? 0) + encaisseEspeces - sorties) * 100) / 100;
  return { fonds, encaisseEspeces, sorties, attendu, mixteSansDetail };
}

export type ResultatSaisie = { ok: true } | { ok: false; erreur: string; statut: number };

export async function enregistrerOuverture(profilId: string, detail: unknown): Promise<ResultatSaisie> {
  const total = totalBilletage(detail);
  if (total === null) return { ok: false, erreur: "Comptage invalide.", statut: 400 };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("mouvements_caisse").insert({
    date_jour: dateMayotteIso(),
    type: "ouverture",
    montant: total,
    detail: detail as Record<string, number>,
    profil_id: profilId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, erreur: "Le fonds de caisse est déjà enregistré aujourd'hui.", statut: 409 };
    throw new Error(error.message);
  }
  return { ok: true };
}

export async function enregistrerSortie(profilId: string, montant: unknown, motif: unknown): Promise<ResultatSaisie> {
  const m = typeof montant === "number" ? Math.round(montant * 100) / 100 : NaN;
  if (!Number.isFinite(m) || m <= 0 || m > 5000) return { ok: false, erreur: "Montant invalide.", statut: 400 };
  const texte = typeof motif === "string" ? motif.trim() : "";
  if (texte.length < 3 || texte.length > 200) return { ok: false, erreur: "Le motif est obligatoire (3 à 200 caractères).", statut: 400 };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("mouvements_caisse").insert({
    date_jour: dateMayotteIso(),
    type: "sortie",
    montant: m,
    motif: texte,
    profil_id: profilId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function enregistrerCloture(
  profilId: string,
  detail: unknown
): Promise<ResultatSaisie & { bilan?: BilanTiroir; compte?: number }> {
  const compte = totalBilletage(detail);
  if (compte === null) return { ok: false, erreur: "Comptage invalide.", statut: 400 };
  const date = dateMayotteIso();
  const etat = await chargerEtatTiroir(date);
  if (etat.cloture) return { ok: false, erreur: "La caisse est déjà clôturée aujourd'hui.", statut: 409 };
  const bilan = await calculerBilanTiroir(date, etat);
  const ecart = Math.round((compte - bilan.attendu) * 100) / 100;
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("mouvements_caisse").insert({
    date_jour: date,
    type: "cloture",
    montant: compte,
    detail: detail as Record<string, number>,
    attendu: bilan.attendu,
    ecart,
    profil_id: profilId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, erreur: "La caisse est déjà clôturée aujourd'hui.", statut: 409 };
    throw new Error(error.message);
  }
  return { ok: true, bilan, compte };
}

/** Annulation (patron) d'une ligne : elle reste visible dans l'historique, mais ne compte plus. */
export async function annulerMouvement(id: string, patronId: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("mouvements_caisse")
    .update({ annule_le: new Date().toISOString(), annule_par: patronId })
    .eq("id", id)
    .is("annule_le", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export interface JourTiroir {
  date: string;
  mouvements: MouvementCaisse[];
}

/** Historique des `jours` derniers jours (annulations incluses), du plus récent au plus ancien. */
export async function listerHistoriqueTiroir(jours = 14): Promise<JourTiroir[]> {
  const supabase = createServiceSupabaseClient();
  const aujourdHui = dateMayotteIso();
  const debut = ajouterJoursIso(aujourdHui, -(jours - 1));
  const { data, error } = await supabase
    .from("mouvements_caisse")
    .select(`date_jour, ${SELECT}`)
    .gte("date_jour", debut)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Lecture de l'historique du tiroir impossible : ${error.message}`);
  const parJour = new Map<string, MouvementCaisse[]>();
  for (const l of (data ?? []) as unknown as (Ligne & { date_jour: string })[]) {
    const liste = parJour.get(l.date_jour) ?? [];
    liste.push(versMouvement(l));
    parJour.set(l.date_jour, liste);
  }
  return [...parJour.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, mouvements]) => ({ date, mouvements }));
}
