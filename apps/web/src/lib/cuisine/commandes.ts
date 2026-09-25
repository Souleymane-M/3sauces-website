import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import {
  STATUTS_TERMINAUX,
  TRANSITIONS_PAR_CANAL,
  type CommandeCuisine,
  type LivreurActif,
  type StatutEvenement,
} from "./types";

const SELECT_COMMANDES_CUISINE =
  "id, numero, canal, statut, contenu, nom_livraison, adresse_livraison, heure_souhaitee, created_at, nb_plats, paiement_statut, mode_paiement, ticket_imprime_le, palier_groupe";

/** Vrai si la date de retrait (Mayotte) diffère de la date de création — la commande a été passée à l'avance. */
function estCommandeAvance(heureSouhaitee: string | null, creeLe: string): boolean {
  if (!heureSouhaitee) return false;
  const versDateMayotteIso = (iso: string) =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
  return versDateMayotteIso(heureSouhaitee) !== versDateMayotteIso(creeLe);
}

function versCommandeCuisine(c: {
  id: string;
  numero: number;
  canal: CommandeCuisine["canal"];
  statut: CommandeCuisine["statut"];
  contenu: unknown;
  nom_livraison: string | null;
  adresse_livraison: string | null;
  heure_souhaitee: string | null;
  created_at: string;
  nb_plats: number;
  ticket_imprime_le: string | null;
  palier_groupe: string | null;
}): CommandeCuisine {
  return {
    id: c.id,
    numero: c.numero,
    canal: c.canal,
    statut: c.statut,
    lignes: Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : [],
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    heureSouhaitee: c.heure_souhaitee,
    creeLe: c.created_at,
    nbPlats: c.nb_plats,
    palierGroupe: c.palier_groupe as PalierGroupe,
    commandeAvance: estCommandeAvance(c.heure_souhaitee, c.created_at),
    ticketImprimeLe: c.ticket_imprime_le,
  };
}

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
  const { fin } = plageJourMayotteUtc(dateMayotteIso());
  const { data, error } = await supabase
    .from("commandes")
    .select(SELECT_COMMANDES_CUISINE)
    .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
    // Une commande payée en ligne (Stripe) n'apparaît en cuisine qu'une fois
    // le paiement confirmé — jamais avant, le temps que le client règle sur
    // la page Stripe ou abandonne. Espèces/CB (payées en personne plus
    // tard) ne sont jamais concernées par ce filtre.
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    // Une commande à l'avance (jour de retrait futur) reste invisible en
    // cuisine jusqu'à son vrai jour — jamais préparée en avance par erreur.
    // Pas de borne basse : une commande plus ancienne restée non terminale
    // (cas anormal) doit continuer à apparaître, pas disparaître silencieusement.
    .lt("heure_souhaitee", fin.toISOString())
    .order("heure_souhaitee", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes : ${error.message}`);
  }

  const commandes: CommandeCuisine[] = (data ?? []).map(versCommandeCuisine);

  // Les commandes ayant atteint un palier "commande groupée"
  // passent en tête, sans perdre l'ordre chronologique existant à
  // l'intérieur de chaque groupe (tri stable).
  return [...commandes].sort((a, b) => Number(b.palierGroupe !== null) - Number(a.palierGroupe !== null));
}

/**
 * Commandes à l'avance dont le jour de retrait n'est pas encore arrivé —
 * purement informatif pour la cuisine (rien à préparer avant le jour J),
 * jamais mélangées à `listerCommandesActives`.
 */
export async function listerCommandesAVenir(): Promise<CommandeCuisine[]> {
  const supabase = createServiceSupabaseClient();
  const { fin } = plageJourMayotteUtc(dateMayotteIso());
  const { data, error } = await supabase
    .from("commandes")
    .select(SELECT_COMMANDES_CUISINE)
    .not("statut", "in", `(${STATUTS_TERMINAUX.join(",")})`)
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .gte("heure_souhaitee", fin.toISOString())
    .order("heure_souhaitee", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes à venir : ${error.message}`);
  }

  return (data ?? []).map(versCommandeCuisine);
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
 * Réutilisée depuis /api/cuisine/commandes (un employé — ou le patron en
 * secours depuis /patron — fait progresser une commande jusqu'à
 * "pris_par_livreur") et depuis /api/livreur/declarer (le livreur déclare
 * "livre" au moment de sa déclaration de paiement) — la garde de rôle
 * correcte est déjà faite au niveau de chaque route (`requireRole(["employe"])`
 * vs `requireRole(["livreur"])`, sachant que `requireRole` laisse toujours
 * passer un patron), donc ici on vérifie juste que le profil existe et est
 * actif, sans imposer un rôle unique.
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
    .in("role", ["employe", "livreur", "patron"])
    .eq("actif", true)
    .maybeSingle();
  if (erreurProfil || !profil) {
    throw new Error("Identité invalide.");
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, canal, statut, mode_paiement, paiement_statut")
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

  // "Remis au client" (sur place/à emporter) est le moment réel de
  // l'encaissement pour une commande espèces/CB payée au comptoir — jusqu'ici
  // rien ne faisait jamais passer `paiement_statut` à "paye" pour ce cas
  // précis (ni Stripe, déjà géré par son webhook, ni la caisse, déjà payée
  // à la création), ce qui empêchait le trigger de fidélité de se déclencher
  // et laissait la commande "non payée" indéfiniment.
  const misesAJour: { statut: StatutEvenement; paiement_statut?: "paye" } = { statut };
  if (statut === "remis_au_client" && commande.mode_paiement !== "stripe" && commande.paiement_statut !== "paye") {
    misesAJour.paiement_statut = "paye";
  }

  const { error: erreurMaj } = await supabase.from("commandes").update(misesAJour).eq("id", commandeId);
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
