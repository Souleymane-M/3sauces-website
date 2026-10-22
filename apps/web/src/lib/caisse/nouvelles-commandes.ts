import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { CommandePourImpression } from "@/lib/impression/types";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import { calculerTamponsPourTicket } from "@/lib/fidelite/tampons";
import { chargerMessageDuMoment } from "@/lib/patron/parametres";

const SELECT_POUR_IMPRESSION =
  "id, numero, canal, contenu, montant, mode_paiement, paiement_statut, nom_livraison, prenom, adresse_livraison, client_telephone, heure_souhaitee, created_at, nb_plats, commande_par, tampons_utilises, imprimer_ticket_client";

type LigneBrutePourImpression = {
  id: string;
  numero: number;
  canal: CommandePourImpression["canal"];
  contenu: unknown;
  montant: number;
  mode_paiement: CommandePourImpression["modePaiement"] | null;
  paiement_statut: string | null;
  nom_livraison: string | null;
  prenom: string | null;
  adresse_livraison: string | null;
  client_telephone: string | null;
  heure_souhaitee: string | null;
  created_at: string;
  nb_plats: number;
  commande_par: string | null;
  tampons_utilises: number | null;
  imprimer_ticket_client: boolean;
};

/**
 * Résout les données dynamiques (QR livraison, tampons fidélité, message du
 * moment) une seule fois pour un lot de commandes, puis construit les
 * `CommandePourImpression` — partagé entre les deux fonctions ci-dessous et
 * la route Server Direct Print (`app/api/print/epson/[token]`).
 */
export async function construireCommandesPourImpression(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  commandes: LigneBrutePourImpression[]
): Promise<CommandePourImpression[]> {
  if (commandes.length === 0) return [];

  const [qrCodeParCommandeId, messageMoment] = await Promise.all([
    ajouterQrCodesLivraison(supabase, commandes),
    chargerMessageDuMoment(),
  ]);
  const messageDuMoment = messageMoment.actif && messageMoment.texte ? messageMoment.texte : null;

  const telephones = [...new Set(commandes.map((c) => c.client_telephone).filter((t): t is string => !!t))];
  const soldeParTelephone = new Map<string, { tampons: number; recompenseDisponible: boolean }>();
  // Date de la toute première commande jamais passée par ce numéro —
  // sert à distinguer "nouveau client" de "client déjà connu" pour le
  // message imprimé sur le ticket (cf. `determinerMessageFidelite` dans
  // epos-print.ts). Comparée telle quelle à `created_at` de chaque
  // commande du lot : si elles coïncident, c'est la toute première.
  const premiereCommandeParTelephone = new Map<string, string>();
  await Promise.all(
    telephones.map(async (tel) => {
      const [solde, { data: premiere }] = await Promise.all([
        calculerTamponsPourTicket(supabase, tel),
        supabase
          .from("commandes")
          .select("created_at")
          .eq("client_telephone", tel)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      soldeParTelephone.set(tel, solde);
      if (premiere) premiereCommandeParTelephone.set(tel, premiere.created_at);
    })
  );

  return commandes.map((c) => {
    const solde = c.client_telephone ? soldeParTelephone.get(c.client_telephone) : undefined;
    return {
      id: c.id,
      numero: c.numero,
      canal: c.canal,
      lignes: (c.contenu as LigneCommande[]) ?? [],
      montant: c.montant,
      modePaiement: c.mode_paiement ?? "especes",
      // Jamais `mode_paiement === "stripe"` seul : ne reflète que le choix
      // du client, pas si Stripe a confirmé l'encaissement (paiement
      // abandonné en cours de route réellement constaté, commande #455,
      // 2026-10-21). `paiement_statut === "paye"` couvre déjà tous les cas
      // légitimes (sur place/à emporter payés à la création, Stripe
      // confirmé par webhook).
      dejaPayee: c.paiement_statut === "paye",
      nom: c.nom_livraison ?? "",
      prenom: c.prenom,
      adresse: c.adresse_livraison,
      heureSouhaitee: c.heure_souhaitee,
      creeLe: c.created_at,
      qrCode: qrCodeParCommandeId.get(c.id) ?? null,
      nbPlats: c.nb_plats,
      clientTelephone: c.client_telephone,
      clientNouveau: c.client_telephone ? premiereCommandeParTelephone.get(c.client_telephone) === c.created_at : null,
      tamponsAffiches: solde ? solde.tampons : null,
      recompenseDisponible: solde ? solde.recompenseDisponible : false,
      messageDuMoment,
      origineCaisse: c.commande_par !== null,
      tamponsUtilises: c.tampons_utilises ?? 0,
      imprimerTicketClient: c.imprimer_ticket_client,
    };
  });
}

function versMinutesDepuisMinuit(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

function heureMayotteEnMinutes(): number {
  const maintenantMayotte = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return maintenantMayotte.getUTCHours() * 60 + maintenantMayotte.getUTCMinutes();
}

async function ajouterQrCodesLivraison(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  commandes: { id: string; canal: string }[]
): Promise<Map<string, string>> {
  const idsLivraison = commandes.filter((c) => c.canal === "livraison").map((c) => c.id);
  const qrCodeParCommandeId = new Map<string, string>();
  if (idsLivraison.length === 0) return qrCodeParCommandeId;

  const { data: livraisons, error } = await supabase
    .from("livraisons")
    .select("commande_id, qr_code")
    .in("commande_id", idsLivraison);
  if (error) {
    throw new Error(`Impossible de charger les QR de livraison : ${error.message}`);
  }
  for (const l of livraisons ?? []) {
    qrCodeParCommandeId.set(l.commande_id, l.qr_code);
  }
  return qrCodeParCommandeId;
}

/**
 * Détecte les commandes reçues depuis le site public (jamais celles prises
 * au comptoir) pour que /caisse les imprime + joue une alerte sonore — cf.
 * caisse-app.tsx. Signal exact : `commande_par` vaut l'id de l'employé pour
 * une commande caisse, `null` pour une commande publique (jamais l'inverse).
 *
 * `curseurSuivant` est l'heure du SERVEUR au moment de la requête, pas
 * `Date.now()` côté iPad : évite tout risque de rater des commandes si
 * l'horloge de l'iPad dérive par rapport à celle de Supabase.
 */
export async function listerNouvellesCommandesPubliques(
  depuis: string | null
): Promise<{ commandes: CommandePourImpression[]; curseurSuivant: string }> {
  const supabase = createServiceSupabaseClient();
  const curseurSuivant = new Date().toISOString();

  if (!depuis) {
    // Premier appel après ouverture de /caisse (aucun curseur persisté) :
    // ne remonte rien pour ne jamais imprimer en rafale l'historique.
    return { commandes: [], curseurSuivant };
  }

  const { fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(SELECT_POUR_IMPRESSION)
    .is("commande_par", null)
    .gt("created_at", depuis)
    // Même filtre que l'écran cuisine (lib/cuisine/commandes.ts) : un
    // paiement en ligne non confirmé ne s'imprime jamais avant d'être
    // réellement payé.
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    // Une commande à l'avance ne s'imprime pas maintenant : elle est prise
    // en charge par listerCommandesAImprimerDifferees, le jour venu.
    .lt("heure_souhaitee", fin.toISOString())
    // Filet de sécurité contre le double-tirage : si /caisse redémarre avec
    // un curseur ancien (iPad resté fermé), une commande à l'avance déjà
    // imprimée entre-temps via le circuit différé ne doit jamais repasser
    // par ici.
    .is("ticket_imprime_le", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Impossible de charger les nouvelles commandes : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return { commandes: [], curseurSuivant };
  }

  const commandesPourImpression = await construireCommandesPourImpression(supabase, commandes);
  return { commandes: commandesPourImpression, curseurSuivant };
}

/**
 * Commandes à l'avance dont le jour de retrait est arrivé, pas encore
 * imprimées, une fois l'heure d'ouverture atteinte (heure Mayotte).
 * `created_at` antérieur à aujourd'hui est ce qui distingue une vraie
 * commande à l'avance d'une commande du jour même — cette dernière est
 * déjà gérée par `listerNouvellesCommandesPubliques` et ne doit jamais
 * être re-détectée ici.
 */
export async function listerCommandesAImprimerDifferees(heureDebut: string): Promise<CommandePourImpression[]> {
  if (heureMayotteEnMinutes() < versMinutesDepuisMinuit(heureDebut)) {
    return [];
  }

  const supabase = createServiceSupabaseClient();
  const { debut, fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(SELECT_POUR_IMPRESSION)
    .is("commande_par", null)
    .gte("heure_souhaitee", debut.toISOString())
    .lt("heure_souhaitee", fin.toISOString())
    .lt("created_at", debut.toISOString())
    .is("ticket_imprime_le", null)
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .order("heure_souhaitee", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes à imprimer : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return [];
  }

  return construireCommandesPourImpression(supabase, commandes);
}

/** Au-delà de ce délai sans confirmation de l'imprimante, un ticket "remis" est reproposé — une imprimante qui ne répond jamais ne doit pas faire perdre une commande pour de bon. */
const DELAI_RECONFIRMATION_MS = 2 * 60 * 1000;

/**
 * Jusqu'à quand retenter l'impression d'une commande jamais confirmée
 * imprimée — assez large pour couvrir une vraie panne (imprimante
 * débranchée une soirée, panne réseau...) sans pour autant rattraper des
 * commandes vieilles de plusieurs semaines. Volontairement basé sur
 * `created_at`, jamais sur `heure_souhaitee` : avant le 2026-10-16, la
 * borne basse utilisait `heure_souhaitee` (pour écarter les commandes à
 * l'avance pas encore arrivées à échéance), ce qui avait un effet de bord
 * grave — une commande dont l'impression avait raté la veille devenait
 * invisible pour toujours dès minuit passé, sans aucune alerte, et la
 * seule façon de la récupérer était de modifier `heure_souhaitee`
 * elle-même (ce qui a fait perdre l'heure réelle demandée par le client
 * pour #357/#358, incident du jour même).
 */
const DELAI_RATTRAPAGE_IMPRESSION_MS = 48 * 60 * 60 * 1000;

/**
 * Toutes les commandes publiques payées, pas encore imprimées, dont
 * l'heure souhaitée est déjà arrivée (jamais une commande à l'avance avant
 * son jour), **y compris les ventes prises directement au comptoir**
 * depuis 2026-10-13 — l'impression ne dépend plus d'aucun appareil local
 * (relais/iPad/Mac), uniquement de cette requête, sondée par l'imprimante
 * elle-même via Server Direct Print (`app/api/print/epson/[token]`).
 *
 * `ticket_remis_le` filtre les tickets déjà envoyés à l'imprimante il y a
 * moins de `DELAI_RECONFIRMATION_MS` : sans ça, un échec silencieux de
 * l'imprimante (bourrage, imprimante occupée — vécu le 2026-10-12,
 * commande #303) ne serait jamais réessayé.
 */
export async function listerCommandesDuJourAImprimer(): Promise<CommandePourImpression[]> {
  const supabase = createServiceSupabaseClient();
  const maintenant = new Date();
  const limiteReconfirmation = new Date(maintenant.getTime() - DELAI_RECONFIRMATION_MS).toISOString();
  const limiteRattrapage = new Date(maintenant.getTime() - DELAI_RATTRAPAGE_IMPRESSION_MS).toISOString();
  // Borne haute = fin de la journée Mayotte, jamais "maintenant" : une
  // commande du jour doit s'imprimer tout de suite pour que la cuisine
  // commence à préparer, pas seulement une fois l'heure de retrait/livraison
  // demandée arrivée (régression du 2026-10-16, repérée sur la commande
  // #376 — passée à 8h25 pour un retrait à 9h, jamais imprimée avant 9h).
  // Seule une vraie commande à l'avance (jour différent) doit attendre.
  const { fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(SELECT_POUR_IMPRESSION)
    .is("ticket_imprime_le", null)
    .or(`ticket_remis_le.is.null,ticket_remis_le.lt.${limiteReconfirmation}`)
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .lt("heure_souhaitee", fin.toISOString())
    .gte("created_at", limiteRattrapage)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Impossible de charger les commandes à imprimer : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return [];
  }

  return construireCommandesPourImpression(supabase, commandes);
}

/** Ticket envoyé à l'imprimante, en attente de confirmation (cf. `listerCommandesDuJourAImprimer`). */
export async function marquerTicketRemis(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("commandes")
    .update({ ticket_remis_le: new Date().toISOString() })
    .eq("id", commandeId);

  if (error) {
    throw new Error(`Impossible de marquer le ticket comme remis : ${error.message}`);
  }
}

export async function marquerTicketImprime(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("commandes")
    .update({ ticket_imprime_le: new Date().toISOString() })
    .eq("id", commandeId);

  if (error) {
    throw new Error(`Impossible de marquer le ticket comme imprimé : ${error.message}`);
  }
}

/**
 * Marque la commande remise à l'imprimante le plus récemment (pas encore
 * confirmée) comme imprimée — utilisé par la route Server Direct Print
 * quand le micrologiciel de l'imprimante est trop ancien pour renvoyer le
 * `printjobid` dans sa confirmation (cf. `app/api/print/epson/[token]`,
 * qui ne remet qu'une seule commande à la fois, rendant cette
 * correspondance fiable).
 */
export async function marquerDernierTicketRemisImprime(): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data, error: erreurLecture } = await supabase
    .from("commandes")
    .select("id")
    .is("ticket_imprime_le", null)
    .not("ticket_remis_le", "is", null)
    .order("ticket_remis_le", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erreurLecture) {
    throw new Error(`Impossible de retrouver le dernier ticket remis : ${erreurLecture.message}`);
  }
  if (!data) return;

  const { error } = await supabase.from("commandes").update({ ticket_imprime_le: new Date().toISOString() }).eq("id", data.id);
  if (error) {
    throw new Error(`Impossible de marquer le ticket comme imprimé : ${error.message}`);
  }
}

/**
 * Demande de réimpression (ticket perdu/abîmé) — ne réimprime jamais ici
 * directement : remet simplement `ticket_imprime_le`/`ticket_remis_le` à
 * null, exactement comme le fait déjà une modification de commande
 * (`/api/caisse/commandes` PATCH). La commande rentre alors naturellement
 * dans la file de `listerCommandesDuJourAImprimer`, et l'imprimante
 * (Server Direct Print, sondage ~5s) l'imprime au cycle suivant — les 2
 * tickets (client + cuisine) ensemble, comme à la création.
 */
export async function demanderReimpressionTicket(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error: erreurLecture } = await supabase
    .from("commandes")
    .select("id, statut")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurLecture || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.statut === "annulee") {
    throw new Error("Cette commande est annulée.");
  }

  const { error } = await supabase
    .from("commandes")
    .update({ ticket_imprime_le: null, ticket_remis_le: null })
    .eq("id", commandeId);
  if (error) {
    throw new Error(`Impossible de redemander l'impression : ${error.message}`);
  }
}
