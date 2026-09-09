import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { CommandeHistorique, EvenementHistorique, TempsPreparationEmploye } from "./commandes-historique-types";

const LIMITE_COMMANDES = 50;

/**
 * Historique complet des commandes récentes pour /patron : chaque
 * changement de statut avec l'employé responsable et l'heure (table
 * `commandes_evenements`, cf. migration 20260908090000_tracabilite_commandes.sql),
 * plus le livreur ayant pris une commande en livraison le cas échéant.
 * Requêtes séparées + fusion en JS (mêmes conventions que
 * lib/caisse/nouvelles-commandes.ts) plutôt qu'un join Supabase imbriqué.
 */
export async function listerHistoriqueCommandes(): Promise<CommandeHistorique[]> {
  const supabase = createServiceSupabaseClient();

  const { data: commandes, error: erreurCommandes } = await supabase
    .from("commandes")
    .select("id, numero, canal, statut, nom_livraison, heure_souhaitee, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMITE_COMMANDES);

  if (erreurCommandes) {
    throw new Error(`Impossible de charger l'historique : ${erreurCommandes.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return [];
  }

  const idsCommandes = commandes.map((c) => c.id);

  const { data: evenements, error: erreurEvenements } = await supabase
    .from("commandes_evenements")
    .select("commande_id, statut, profil_id, created_at")
    .in("commande_id", idsCommandes)
    .order("created_at", { ascending: true });

  if (erreurEvenements) {
    throw new Error(`Impossible de charger les évènements : ${erreurEvenements.message}`);
  }

  const idsLivraison = commandes.filter((c) => c.canal === "livraison").map((c) => c.id);
  const { data: livraisons, error: erreurLivraisons } = await supabase
    .from("livraisons")
    .select("commande_id, livreur_id")
    .in("commande_id", idsLivraison.length > 0 ? idsLivraison : [""]);

  if (erreurLivraisons) {
    throw new Error(`Impossible de charger les livraisons : ${erreurLivraisons.message}`);
  }

  const idsProfils = [
    ...new Set([...(evenements ?? []).map((e) => e.profil_id), ...(livraisons ?? []).map((l) => l.livreur_id)]),
  ].filter((id): id is string => Boolean(id));

  const { data: profils, error: erreurProfils } = await supabase
    .from("profils")
    .select("id, nom")
    .in("id", idsProfils.length > 0 ? idsProfils : [""]);

  if (erreurProfils) {
    throw new Error(`Impossible de charger les profils : ${erreurProfils.message}`);
  }
  const nomParProfilId = new Map((profils ?? []).map((p) => [p.id, p.nom]));
  const livreurIdParCommandeId = new Map((livraisons ?? []).map((l) => [l.commande_id, l.livreur_id]));

  const evenementsParCommandeId = new Map<string, EvenementHistorique[]>();
  for (const e of evenements ?? []) {
    const liste = evenementsParCommandeId.get(e.commande_id) ?? [];
    liste.push({ statut: e.statut, profilNom: nomParProfilId.get(e.profil_id) ?? "?", creeLe: e.created_at });
    evenementsParCommandeId.set(e.commande_id, liste);
  }

  return commandes.map((c) => {
    const livreurId = livreurIdParCommandeId.get(c.id);
    return {
      id: c.id,
      numero: c.numero,
      canal: c.canal,
      statut: c.statut,
      nom: c.nom_livraison ?? "",
      heureSouhaitee: c.heure_souhaitee,
      creeLe: c.created_at,
      evenements: evenementsParCommandeId.get(c.id) ?? [],
      livreurNom: livreurId ? (nomParProfilId.get(livreurId) ?? null) : null,
    };
  });
}

/**
 * Temps de préparation moyen par employé : écart entre l'évènement
 * "en_preparation" et l'évènement "pret" d'une même commande, attribué à
 * l'employé qui a marqué "pret" (celui qui a terminé la préparation).
 */
export async function calculerTempsPreparationMoyenParEmploye(): Promise<TempsPreparationEmploye[]> {
  const supabase = createServiceSupabaseClient();

  const { data: evenements, error } = await supabase
    .from("commandes_evenements")
    .select("commande_id, statut, profil_id, created_at")
    .in("statut", ["en_preparation", "pret"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de calculer les temps de préparation : ${error.message}`);
  }
  if (!evenements || evenements.length === 0) {
    return [];
  }

  const parCommande = new Map<string, { debut?: string; fin?: string; profilId?: string }>();
  for (const e of evenements) {
    const entree = parCommande.get(e.commande_id) ?? {};
    if (e.statut === "en_preparation") entree.debut = e.created_at;
    if (e.statut === "pret") {
      entree.fin = e.created_at;
      entree.profilId = e.profil_id;
    }
    parCommande.set(e.commande_id, entree);
  }

  const dureesParProfil = new Map<string, number[]>();
  for (const { debut, fin, profilId } of parCommande.values()) {
    if (!debut || !fin || !profilId) continue;
    const dureeMinutes = (new Date(fin).getTime() - new Date(debut).getTime()) / 60_000;
    if (dureeMinutes < 0) continue;
    const liste = dureesParProfil.get(profilId) ?? [];
    liste.push(dureeMinutes);
    dureesParProfil.set(profilId, liste);
  }

  const idsProfils = [...dureesParProfil.keys()];
  const { data: profils, error: erreurProfils } = await supabase
    .from("profils")
    .select("id, nom")
    .in("id", idsProfils.length > 0 ? idsProfils : [""]);

  if (erreurProfils) {
    throw new Error(`Impossible de charger les profils : ${erreurProfils.message}`);
  }
  const nomParProfilId = new Map((profils ?? []).map((p) => [p.id, p.nom]));

  return [...dureesParProfil.entries()]
    .map(([profilId, durees]) => ({
      profilNom: nomParProfilId.get(profilId) ?? "?",
      tempsMoyenMinutes: Math.round((durees.reduce((a, b) => a + b, 0) / durees.length) * 10) / 10,
      nombreCommandes: durees.length,
    }))
    .sort((a, b) => a.tempsMoyenMinutes - b.tempsMoyenMinutes);
}
