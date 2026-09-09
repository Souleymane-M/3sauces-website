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
 * commande), met à jour `commandes.statut` (+ `livraisons.livreur_id`/
 * `statut`/horodatages si pertinent), puis journalise l'évènement.
 * L'échec de la journalisation n'annule jamais le changement de statut
 * déjà appliqué — même logique "jamais de blocage" que le reste du code
 * (impression, etc.).
 *
 * Réutilisée à la fois depuis /api/cuisine/commandes (un employé fait
 * progresser une commande jusqu'à "pris_par_livreur") et depuis
 * /api/livreur/declarer (le livreur déclare "livre" au moment de sa
 * déclaration de paiement) — la garde de rôle correcte est déjà faite au
 * niveau de chaque route (`requireRole(["employe"])` vs
 * `requireRole(["livreur"])`), donc ici on vérifie juste que le profil
 * existe et est actif, sans imposer un rôle unique.
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
    .in("role", ["employe", "livreur"])
    .eq("actif", true)
    .maybeSingle();
  if (erreurProfil || !profil) {
    throw new Error("Identité invalide.");
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

  // Effets de bord sur `livraisons` : alimentent les vues déjà présentes en
  // base depuis la conception d'origine (v_recap_livreur_jour) qui
  // attendaient déjà `statut`/`heure_depart_cuisine`/`heure_livraison_effective`,
  // jamais renseignés jusqu'ici.
  if (statut === "pris_par_livreur" && livreurId) {
    const { error: erreurLivreur } = await supabase
      .from("livraisons")
      .update({ livreur_id: livreurId, statut: "en_livraison", heure_depart_cuisine: new Date().toISOString() })
      .eq("commande_id", commandeId);
    if (erreurLivreur) {
      console.error("[cuisine/commandes] échec attribution livreur :", erreurLivreur.message);
    }
  } else if (statut === "livre") {
    const { error: erreurLivraison } = await supabase
      .from("livraisons")
      .update({ statut: "livre", heure_livraison_effective: new Date().toISOString() })
      .eq("commande_id", commandeId);
    if (erreurLivraison) {
      console.error("[cuisine/commandes] échec cloture livraison :", erreurLivraison.message);
    }
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut, profil_id: profilId });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation évènement :", erreurEvenement.message);
  }
}
