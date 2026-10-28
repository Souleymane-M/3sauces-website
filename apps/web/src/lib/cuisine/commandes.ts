import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { RoleMetier } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { notifierCommandeAnnulee } from "@/lib/notifications/paiement";
import {
  STATUTS_TERMINAUX,
  TRANSITIONS_PAR_CANAL,
  type CommandeCuisine,
  type LivraisonEnCours,
  type LivreurActif,
  type StatutEvenement,
} from "./types";

const SELECT_COMMANDES_CUISINE =
  "id, numero, canal, statut, contenu, montant, nom_livraison, client_telephone, adresse_livraison, heure_souhaitee, created_at, nb_plats, paiement_statut, mode_paiement, ticket_imprime_le, palier_groupe, statut_change_le, commande_par";

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
  montant: number;
  nom_livraison: string | null;
  client_telephone: string | null;
  adresse_livraison: string | null;
  heure_souhaitee: string | null;
  created_at: string;
  nb_plats: number;
  ticket_imprime_le: string | null;
  palier_groupe: string | null;
  mode_paiement: CommandeCuisine["modePaiement"];
  paiement_statut: string | null;
  statut_change_le: string | null;
  commande_par: string | null;
}): CommandeCuisine {
  return {
    id: c.id,
    numero: c.numero,
    canal: c.canal,
    statut: c.statut,
    lignes: Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : [],
    montant: c.montant,
    nom: c.nom_livraison ?? "",
    telephone: c.client_telephone,
    adresse: c.adresse_livraison,
    modePaiement: c.mode_paiement,
    dejaPayee: c.paiement_statut === "paye",
    heureSouhaitee: c.heure_souhaitee,
    creeLe: c.created_at,
    nbPlats: c.nb_plats,
    palierGroupe: c.palier_groupe as PalierGroupe,
    commandeAvance: estCommandeAvance(c.heure_souhaitee, c.created_at),
    ticketImprimeLe: c.ticket_imprime_le,
    statutChangeLe: c.statut_change_le,
    // `commande_par` = id employé pour une commande saisie en caisse, null
    // pour une commande passée par le client sur le site public — demande
    // explicite du patron, 2026-10-20 : distinguer l'origine, aussi bien
    // ici qu'à l'impression.
    origineCaisse: c.commande_par !== null,
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
 * Livraisons déjà prises en charge par un livreur, pour la colonne "En
 * cours de livraison" de l'écran cuisine — demande explicite du patron,
 * 2026-10-16 : une livraison signalée "impossible à livrer" depuis le scan
 * (cf. `signalerLivraisonNonEffectuee`) doit être vue en temps réel par
 * quelqu'un sur place, pas seulement par email (pas fiable, personne ne
 * consulte sa boîte en continu). Même borne que `listerCommandesActives`
 * (jour courant, pas de borne basse) pour la même raison : ne jamais
 * cacher une anomalie en silence.
 */
export async function listerLivraisonsEnCours(): Promise<LivraisonEnCours[]> {
  const supabase = createServiceSupabaseClient();
  const { fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(
      "id, numero, contenu, montant, nom_livraison, client_telephone, adresse_livraison, heure_souhaitee, created_at, alerte_signalee, alerte_note, alerte_signalee_le, commande_par"
    )
    .eq("canal", "livraison")
    .eq("statut", "pris_par_livreur")
    .lt("heure_souhaitee", fin.toISOString())
    .order("heure_souhaitee", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Impossible de charger les livraisons en cours : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) return [];

  const ids = commandes.map((c) => c.id);
  const { data: livraisons, error: erreurLivraisons } = await supabase
    .from("livraisons")
    .select("commande_id, livreur_id")
    .in("commande_id", ids);
  if (erreurLivraisons) {
    throw new Error(`Impossible de charger les livreurs assignés : ${erreurLivraisons.message}`);
  }

  const livreurIdParCommande = new Map((livraisons ?? []).map((l) => [l.commande_id, l.livreur_id]));
  const livreurIds = [...new Set((livraisons ?? []).map((l) => l.livreur_id).filter((id): id is string => !!id))];
  const { data: profils } =
    livreurIds.length > 0 ? await supabase.from("profils").select("id, nom").in("id", livreurIds) : { data: [] };
  const nomParLivreurId = new Map((profils ?? []).map((p) => [p.id, p.nom]));

  const resultats: LivraisonEnCours[] = commandes.map((c) => {
    const livreurId = livreurIdParCommande.get(c.id) ?? null;
    return {
      id: c.id,
      numero: c.numero,
      lignes: Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : [],
      montant: c.montant,
      nom: c.nom_livraison ?? "",
      telephone: c.client_telephone,
      adresse: c.adresse_livraison,
      heureSouhaitee: c.heure_souhaitee,
      creeLe: c.created_at,
      livreurNom: (livreurId ? nomParLivreurId.get(livreurId) : null) ?? "—",
      alerteSignalee: c.alerte_signalee,
      alerteNote: c.alerte_note,
      alerteSignaleeLe: c.alerte_signalee_le,
      origineCaisse: c.commande_par !== null,
    };
  });

  // Les livraisons signalées "impossible à livrer" en tête — c'est ce qui
  // demande une action immédiate, jamais noyé dans la liste.
  return [...resultats].sort((a, b) => Number(b.alerteSignalee) - Number(a.alerteSignalee));
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

/**
 * Commandes du jour non clôturées, pour l'écran "Fin de service" — à la
 * différence de `listerCommandesActives`, inclut volontairement
 * "pris_par_livreur" (une livraison jamais confirmée "livrée" doit
 * pouvoir être fermée ici, cf. `cloturerCommandeFinService`).
 */
export async function listerCommandesNonCloturees(): Promise<CommandeCuisine[]> {
  const supabase = createServiceSupabaseClient();
  const { fin } = plageJourMayotteUtc(dateMayotteIso());
  const { data, error } = await supabase
    .from("commandes")
    .select(SELECT_COMMANDES_CUISINE)
    .not("statut", "in", "(livre,remis_au_client,annulee)")
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .lt("heure_souhaitee", fin.toISOString())
    .order("heure_souhaitee", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes non clôturées : ${error.message}`);
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
  /** Sous quel rôle métier l'action a été faite (interface équipe unifiée) — absent pour les appelants existants. */
  roleMetier?: RoleMetier;
  /** Répartition espèces/carte, exigée à la remise d'une commande "mixte" non encore payée. */
  paiementsMixte?: { mode: "especes" | "cb"; montant: number }[];
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
  roleMetier,
  paiementsMixte,
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
    .select("id, canal, statut, mode_paiement, paiement_statut, montant")
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
  const misesAJour: { statut: StatutEvenement; paiement_statut?: "paye"; statut_change_le: string } = {
    statut,
    // Minuteur par étape de l'écran cuisine (alerte après 15 min dans le
    // même statut) — remis à zéro à chaque transition, jamais calculé
    // depuis la création de la commande.
    statut_change_le: new Date().toISOString(),
  };
  if (statut === "remis_au_client" && commande.mode_paiement !== "stripe" && commande.paiement_statut !== "paye") {
    misesAJour.paiement_statut = "paye";
  }

  // Commande "mixte" payée à la remise : la répartition espèces/carte est
  // indispensable pour que l'argent apparaisse dans les bons totaux et dans
  // le comptage du tiroir (cas #681, 2026-10-27 : 68 € sans aucune ligne).
  // Vérifiée AVANT de toucher à la commande.
  let lignesMixte: { mode: "especes" | "cb"; montant: number }[] | null = null;
  if (misesAJour.paiement_statut && commande.mode_paiement === "mixte") {
    const lignes = paiementsMixte ?? [];
    const valides =
      lignes.length > 0 &&
      lignes.every((l) => (l.mode === "especes" || l.mode === "cb") && Number.isFinite(l.montant) && l.montant > 0) &&
      Math.round(lignes.reduce((t, l) => t + l.montant, 0) * 100) === Math.round(Number(commande.montant) * 100);
    if (!valides) {
      throw new Error(
        `Commande payée en mixte : indique combien en espèces et combien en carte (total ${Number(commande.montant).toFixed(2)} €).`
      );
    }
    lignesMixte = lignes;
  }

  // Mise à jour conditionnelle : seul l'appel qui fait réellement passer la
  // commande à "payé" enregistre le paiement (pas de doublon si deux
  // écrans valident la remise en même temps).
  let requeteMaj = supabase.from("commandes").update(misesAJour).eq("id", commandeId);
  if (misesAJour.paiement_statut) requeteMaj = requeteMaj.neq("paiement_statut", "paye");
  const { data: lignesMaj, error: erreurMaj } = await requeteMaj.select("id");
  if (erreurMaj) {
    throw new Error(`Impossible de mettre à jour le statut : ${erreurMaj.message}`);
  }

  // Sans ligne `paiements`, l'encaissement fait à la remise n'apparaissait
  // ni dans le total espèces/CB du jour ni dans le comptage du tiroir. Un
  // paiement "mixte" n'a pas de répartition connue ici : on ne l'invente pas.
  if (
    misesAJour.paiement_statut &&
    (lignesMaj ?? []).length > 0 &&
    (commande.mode_paiement === "especes" || commande.mode_paiement === "cb")
  ) {
    const { error: erreurPaiement } = await supabase
      .from("paiements")
      .insert({ commande_id: commandeId, montant: Number(commande.montant), mode: commande.mode_paiement });
    if (erreurPaiement) {
      console.error("[cuisine/commandes] échec enregistrement paiement à la remise :", erreurPaiement.message);
    }
  } else if (lignesMixte && (lignesMaj ?? []).length > 0) {
    const { error: erreurPaiementMixte } = await supabase
      .from("paiements")
      .insert(lignesMixte.map((l) => ({ commande_id: commandeId, montant: l.montant, mode: l.mode })));
    if (erreurPaiementMixte) {
      console.error("[cuisine/commandes] échec enregistrement paiement mixte à la remise :", erreurPaiementMixte.message);
    }
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
    .insert({ commande_id: commandeId, statut, profil_id: profilId, role_metier: roleMetier ?? null });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation évènement :", erreurEvenement.message);
  }
}

interface AnnulationCommande {
  commandeId: string;
  profilId: string;
  motif?: string;
}

/** Statuts où une commande peut encore être annulée (jamais déjà livrée/remise/annulée). */
const STATUTS_ANNULABLES = ["en_attente", "en_preparation", "pret", "pris_par_livreur"] as const;

/**
 * Annule une commande à tout moment avant qu'elle soit livrée/remise —
 * demande du patron, 2026-10-28 : en pleine préparation, un client peut
 * appeler pour annuler. (Avant, limité à "en_attente".) Restitue le stock du
 * jour déjà décompté (plats du jour). Si la commande était payée, le
 * trigger DB `commandes_appliquer_fidelite` reverse l'accumulation déjà
 * créditée — jamais le cas d'une récompense déjà consommée sur cette
 * commande, à corriger à la main si besoin (rare, pas encore outillé).
 * Le remboursement réel (carte ou espèces) reste toujours fait à la main,
 * hors de l'app.
 */
export async function annulerCommande({ commandeId, profilId, motif }: AnnulationCommande): Promise<void> {
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
    .select("id, statut, contenu")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (!(STATUTS_ANNULABLES as readonly string[]).includes(commande.statut)) {
    throw new Error("Cette commande est déjà livrée, remise ou annulée : elle ne peut plus être annulée.");
  }

  const { data: annulees, error: erreurMaj } = await supabase
    .from("commandes")
    .update({ statut: "annulee", motif_annulation: motif?.trim() || null })
    .eq("id", commandeId)
    .in("statut", [...STATUTS_ANNULABLES])
    .select("id");
  if (erreurMaj) {
    throw new Error(`Impossible d'annuler la commande : ${erreurMaj.message}`);
  }
  // Déjà annulée/livrée entre-temps par quelqu'un d'autre : rien à refaire (et surtout pas rendre le stock deux fois).
  if ((annulees ?? []).length === 0) return;

  const lignes = Array.isArray(commande.contenu)
    ? (commande.contenu as { produitId?: string; quantite?: number }[])
    : [];
  if (lignes.length > 0) {
    const { error: erreurStock } = await supabase.rpc("incrementer_stocks_produits", {
      items: lignes
        .filter((l): l is { produitId: string; quantite: number } => Boolean(l.produitId) && Boolean(l.quantite))
        .map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
    });
    if (erreurStock) {
      console.error("[cuisine/commandes] échec restitution stock à l'annulation :", erreurStock.message);
    }
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut: "annulee", profil_id: profilId });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation annulation :", erreurEvenement.message);
  }

  await notifierCommandeAnnulee(commandeId, motif?.trim() || null).catch((e) =>
    console.error("[cuisine/commandes] échec notification annulation :", e)
  );
}

export const MOTIFS_FIN_SERVICE = ["no_show", "erreur", "annulation", "client_injoignable"] as const;
export type MotifFinService = (typeof MOTIFS_FIN_SERVICE)[number];

interface ClotureFinService {
  commandeId: string;
  profilId: string;
  motif: MotifFinService;
  roleMetier?: RoleMetier;
}

/**
 * Clôture de fin de service (interface équipe unifiée, 2026-10-19) : une
 * commande restée non terminale à la fermeture, peu importe son statut
 * (en_attente, en_preparation, pret, pris_par_livreur — jamais déjà
 * "livre"/"remis_au_client"/"annulee"), doit être fermée avec un motif
 * structuré obligatoire — jamais laissée traîner au lendemain. Mêmes
 * effets de bord que `annulerCommande` (restitution stock, notification
 * client) mais sans sa restriction à "en_attente" : c'est précisément
 * la différence entre les deux actions. Les motifs remontent au Pilotage
 * pour comprendre le fonctionnement, jamais pour sanctionner quelqu'un.
 */
export async function cloturerCommandeFinService({
  commandeId,
  profilId,
  motif,
  roleMetier,
}: ClotureFinService): Promise<void> {
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
  if (!MOTIFS_FIN_SERVICE.includes(motif)) {
    throw new Error("Motif de clôture invalide.");
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, statut, contenu")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  // Volontairement différent de `STATUTS_TERMINAUX` (qui exclut aussi
  // "pris_par_livreur" — terminal seulement du point de vue de la cuisine) :
  // une livraison jamais confirmée "livrée" doit pouvoir être clôturée ici.
  if (commande.statut === "livre" || commande.statut === "remis_au_client" || commande.statut === "annulee") {
    throw new Error("Cette commande est déjà clôturée.");
  }

  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({ statut: "annulee", motif_annulation: motif })
    .eq("id", commandeId);
  if (erreurMaj) {
    throw new Error(`Impossible de clôturer la commande : ${erreurMaj.message}`);
  }

  const lignes = Array.isArray(commande.contenu)
    ? (commande.contenu as { produitId?: string; quantite?: number }[])
    : [];
  if (lignes.length > 0) {
    const { error: erreurStock } = await supabase.rpc("incrementer_stocks_produits", {
      items: lignes
        .filter((l): l is { produitId: string; quantite: number } => Boolean(l.produitId) && Boolean(l.quantite))
        .map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
    });
    if (erreurStock) {
      console.error("[cuisine/commandes] échec restitution stock à la clôture :", erreurStock.message);
    }
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut: "annulee", profil_id: profilId, role_metier: roleMetier ?? null });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation clôture :", erreurEvenement.message);
  }

  await notifierCommandeAnnulee(commandeId, motif).catch((e) =>
    console.error("[cuisine/commandes] échec notification clôture :", e)
  );
}

/**
 * Résout une livraison signalée "impossible à livrer" (colonne "En cours
 * de livraison" de l'écran cuisine) — deux issues possibles, décidées en
 * interne par un employé/le patron, jamais automatique :
 *
 * - "remettre" : le plat est encore utilisable (ex: client qui recontacte
 *   tout de suite) — repasse "prête", retire le livreur assigné, efface
 *   le signalement, pour qu'elle soit de nouveau scannable par un livreur.
 * - "annuler" : la commande est définitivement perdue — mêmes effets que
 *   `annulerCommande` (restitution du stock, notification client), mais
 *   applicable ici à une commande déjà "pris_par_livreur" (contrairement
 *   à `annulerCommande`, volontairement limitée à "en_attente").
 */
export async function resoudreLivraisonSignalee(
  commandeId: string,
  profilId: string,
  action: "remettre" | "annuler",
  motif?: string
): Promise<void> {
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
    .select("id, statut, contenu, alerte_signalee")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.statut !== "pris_par_livreur" || !commande.alerte_signalee) {
    throw new Error("Cette commande n'est pas signalée comme non livrée.");
  }

  if (action === "remettre") {
    const { error: erreurMaj } = await supabase
      .from("commandes")
      .update({
        statut: "pret",
        statut_change_le: new Date().toISOString(),
        alerte_signalee: false,
        alerte_note: null,
        alerte_signalee_par: null,
        alerte_signalee_le: null,
      })
      .eq("id", commandeId);
    if (erreurMaj) {
      throw new Error(`Impossible de remettre la commande en circulation : ${erreurMaj.message}`);
    }

    const { error: erreurLivraison } = await supabase
      .from("livraisons")
      .update({ statut: "en_attente", livreur_id: null, heure_depart_cuisine: null })
      .eq("commande_id", commandeId);
    if (erreurLivraison) {
      console.error("[cuisine/commandes] échec remise en circulation côté livraisons :", erreurLivraison.message);
    }

    const { error: erreurEvenement } = await supabase
      .from("commandes_evenements")
      .insert({ commande_id: commandeId, statut: "pret", profil_id: profilId });
    if (erreurEvenement) {
      console.error("[cuisine/commandes] échec journalisation remise en circulation :", erreurEvenement.message);
    }
    return;
  }

  // action === "annuler"
  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({ statut: "annulee", motif_annulation: motif?.trim() || "Livraison impossible" })
    .eq("id", commandeId);
  if (erreurMaj) {
    throw new Error(`Impossible d'annuler la commande : ${erreurMaj.message}`);
  }

  const lignes = Array.isArray(commande.contenu)
    ? (commande.contenu as { produitId?: string; quantite?: number }[])
    : [];
  if (lignes.length > 0) {
    const { error: erreurStock } = await supabase.rpc("incrementer_stocks_produits", {
      items: lignes
        .filter((l): l is { produitId: string; quantite: number } => Boolean(l.produitId) && Boolean(l.quantite))
        .map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
    });
    if (erreurStock) {
      console.error("[cuisine/commandes] échec restitution stock à l'annulation :", erreurStock.message);
    }
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut: "annulee", profil_id: profilId });
  if (erreurEvenement) {
    console.error("[cuisine/commandes] échec journalisation annulation :", erreurEvenement.message);
  }

  await notifierCommandeAnnulee(commandeId, motif?.trim() || "Livraison impossible").catch((e) =>
    console.error("[cuisine/commandes] échec notification annulation :", e)
  );
}
