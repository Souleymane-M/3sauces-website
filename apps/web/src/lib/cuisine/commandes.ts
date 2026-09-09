import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import {
  STATUTS_TERMINAUX,
  TRANSITIONS_PAR_CANAL,
  type CommandeCuisine,
  type LivreurActif,
  type StatutEvenement,
} from "./types";

/**
 * Commandes affichées sur l'écran cuisine (/commandes) : toutes les
 * commandes actives, caisse ET site public confondues, contrairement à
 * `lib/caisse/nouvelles-commandes.ts` qui ne regarde que les commandes
 * publiques (usage différent : ici c'est un tableau de bord temps réel
 * pour la cuisine, pas une détection de nouvelles commandes pour
 * l'impression).
 */
export async function listerCommandesActives(): Promise<CommandeCuisine[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select("id, numero, canal, statut, contenu, nom_livraison, adresse_livraison, heure_souhaitee, created_at")
    .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
    .order("heure_souhaitee", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    canal: c.canal,
    statut: c.statut,
    lignes: (Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : []),
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    heureSouhaitee: c.heure_souhaitee,
    creeLe: c.created_at,
  }));
}

export async function listerLivreursActifs(): Promise<LivreurActif[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profils")
    .select("id, nom")
    .eq("role", "livreur")
    .eq("actif", true)
    .order("nom", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les livreurs : ${error.message}`);
  }
  return data ?? [];
}

interface ChangementStatut {
  commandeId: string;
  statut: StatutEvenement;
  profilId: string;
  livreurId?: string;
}

/**
 * Valide la transition (contre le statut actuel et le canal de la
 * commande), met à jour `commandes.statut` (+ `livraisons.livreur_id` si
 * fourni), puis journalise l'évènement. L'échec de la journalisation
 * n'annule jamais le changement de statut déjà appliqué — même logique
 * "jamais de blocage" que le reste du code (impression, etc.).
 */
export async function changerStatutCommande({
  commandeId,
  statut,
  profilId,
  livreurId,
}: ChangementStatut): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: profil, error: erreurProfil } = await supabase
    .from("profils")
    .select("id")
    .eq("id", profilId)
    .eq("role", "employe")
    .eq("actif", true)
    .maybeSingle();
  if (erreurProfil || !profil) {
    throw new Error("Identité employé invalide.");
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, canal, statut")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }

  const statutSuivantAttendu = TRANSITIONS_PAR_CANAL[commande.canal]?.[commande.statut];
  if (statutSuivantAttendu !== statut) {
    throw new Error(`Transition invalide : ${commande.statut} -> ${statut} pour le canal ${commande.canal}.`);
  }
  if (statut === "pris_par_livreur" && !livreurId) {
    throw new Error("Choisis le livreur qui prend la commande.");
  }

  const { error: erreurMaj } = await supabase.from("commandes").update({ statut }).eq("id", commandeId);
  if (erreurMaj) {
    throw new Error(`Impossible de mettre à jour le statut : ${erreurMaj.message}`);
  }

  if (statut === "pris_par_livreur" && livreurId) {
    const { error: erreurLivreur } = await supabase
      .from("livraisons")
      .update({ livreur_id: livreurId })
      .eq("commande_id", commandeId);
    if (erreurLivreur) {
      console.error("[cuisine/commandes] échec attribution livreur :", erreurLivreur.message);
    }
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut, profil_id: profilId });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation évènement :", erreurEvenement.message);
  }
}
