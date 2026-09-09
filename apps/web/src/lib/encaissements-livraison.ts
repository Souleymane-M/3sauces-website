import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { ModePaiement } from "@3sauces/supabase";
import type { EncaissementsJour, LivraisonAEncaisser } from "./encaissements-livraison-types";

/**
 * Une livraison prise au téléphone par la caisse est enregistrée
 * "non_paye" (cf. /api/caisse/commandes) : le client paie le livreur à la
 * remise, pas la caisse à la prise de commande. Le livreur déclare ensuite
 * ce qu'il a récupéré depuis /livreur (lib/livreur/commandes.ts,
 * `declarerLivraison`) — la commande passe alors à "declare", avec ses
 * lignes `paiements` déjà enregistrées. Cette régularisation est
 * accessible à la fois côté caisse
 * (components/caisse/encaissements-livraison-caisse.tsx, contrôle sur
 * place par le responsable de caisse) et côté patron
 * (components/patron/encaissements-livraison-app.tsx, contrôle à
 * distance) — le patron n'a pas vocation à être présent en permanence.
 * "Valider" (ex-"Encaissée") passe `paiement_statut` à 'paye', ce qui
 * déclenche le trigger DB `commandes_appliquer_fidelite` au bon moment ;
 * "Signaler un écart" ne change jamais `paiement_statut`, juste un
 * signalement pour revue.
 */
export async function listerLivraisonsAEncaisser(): Promise<LivraisonAEncaisser[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select(
      "id, numero, nom_livraison, adresse_livraison, montant, mode_paiement, created_at, paiement_statut, alerte_signalee, alerte_note"
    )
    .eq("canal", "livraison")
    .neq("paiement_statut", "paye")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les livraisons à encaisser : ${error.message}`);
  }
  if (!data || data.length === 0) {
    return [];
  }

  const idsCommandes = data.map((c) => c.id);
  const { data: paiements, error: erreurPaiements } = await supabase
    .from("paiements")
    .select("commande_id, mode, montant, payeur")
    .in("commande_id", idsCommandes);

  if (erreurPaiements) {
    throw new Error(`Impossible de charger les paiements déclarés : ${erreurPaiements.message}`);
  }

  const paiementsParCommandeId = new Map<string, { mode: string; montant: number; payeur: string | null }[]>();
  for (const p of paiements ?? []) {
    if (!p.commande_id) continue;
    const liste = paiementsParCommandeId.get(p.commande_id) ?? [];
    liste.push({ mode: p.mode, montant: p.montant, payeur: p.payeur });
    paiementsParCommandeId.set(p.commande_id, liste);
  }

  return data.map((c) => ({
    id: c.id,
    numero: c.numero,
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    montant: c.montant,
    modePaiement: c.mode_paiement,
    creeLe: c.created_at,
    statutPaiement: c.paiement_statut === "declare" ? "declare" : "non_paye",
    paiementsDeclares: (paiementsParCommandeId.get(c.id) ?? []).map((p) => ({
      mode: p.mode as ModePaiement,
      montant: p.montant,
      payeur: p.payeur,
    })),
    alerteSignalee: c.alerte_signalee,
    alerteNote: c.alerte_note,
  }));
}

export async function marquerLivraisonEncaissee(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurLecture } = await supabase
    .from("commandes")
    .select("id, canal, paiement_statut")
    .eq("id", commandeId)
    .maybeSingle();

  if (erreurLecture || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison") {
    throw new Error("Cette commande n'est pas une livraison.");
  }
  if (commande.paiement_statut === "paye") {
    throw new Error("Cette commande est déjà marquée comme encaissée.");
  }
  if (commande.paiement_statut !== "declare") {
    throw new Error("Le livreur n'a pas encore déclaré cette livraison.");
  }

  // Les paiements sont déjà enregistrés (déclarés par le livreur à la
  // livraison, cf. lib/livreur/commandes.ts) — valider ne fait que
  // confirmer, jamais de nouvelle ligne `paiements` créée ici.
  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({ paiement_statut: "paye" })
    .eq("id", commandeId);

  if (erreurMaj) {
    throw new Error(`Impossible de valider l'encaissement : ${erreurMaj.message}`);
  }
}

export async function signalerEcartLivraison(commandeId: string, note: string, profilId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("commandes")
    .update({
      alerte_signalee: true,
      alerte_note: note,
      alerte_signalee_par: profilId,
      alerte_signalee_le: new Date().toISOString(),
    })
    .eq("id", commandeId);

  if (error) {
    throw new Error(`Impossible de signaler l'écart : ${error.message}`);
  }
}

/** Total encaissé du jour par mode de paiement — lit la vue `v_encaissements_jour`. */
export async function calculerEncaissementsJour(): Promise<EncaissementsJour> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("v_encaissements_jour").select("mode, total");

  if (error) {
    throw new Error(`Impossible de calculer les encaissements du jour : ${error.message}`);
  }

  const parMode = new Map((data ?? []).map((r) => [r.mode, r.total as number]));
  return {
    especes: parMode.get("especes") ?? 0,
    cb: parMode.get("cb") ?? 0,
  };
}

/** Commandes avec un écart signalé non résolu (tous canaux confondus). */
export async function listerAlertesEncaissement(): Promise<
  { id: string; numero: number; nom: string; note: string | null; signaleeLe: string | null }[]
> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select("id, numero, nom_livraison, alerte_note, alerte_signalee_le")
    .eq("alerte_signalee", true)
    .order("alerte_signalee_le", { ascending: false });

  if (error) {
    throw new Error(`Impossible de charger les alertes : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    nom: c.nom_livraison ?? "",
    note: c.alerte_note,
    signaleeLe: c.alerte_signalee_le,
  }));
}
