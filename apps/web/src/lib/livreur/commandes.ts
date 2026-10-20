import "server-only";
import type { RoleMetier } from "@3sauces/supabase";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { changerStatutCommande } from "@/lib/cuisine/commandes";
import { notifierPaiementConfirme, notifierLivraisonNonEffectuee } from "@/lib/notifications/paiement";
import type { LigneCommande } from "@/lib/caisse/types";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";
import type { EtatScan, LivraisonAssignee, PaiementDeclare } from "./types";

/**
 * Livraisons remises à CE livreur (prise en charge par scan,
 * `heure_depart_cuisine` posé à ce moment-là) et pas encore déclarées
 * comme livrées — deux requêtes + fusion en JS, même style que
 * lib/caisse/nouvelles-commandes.ts.
 *
 * Bornée à AUJOURD'HUI (Mayotte), contrairement à la liste cuisine
 * (`listerCommandesActives`, volontairement sans borne basse) : une
 * livraison se conclut normalement en moins d'une heure ou deux, jamais
 * des jours plus tard — une commande restée "pris_par_livreur" depuis des
 * semaines n'est pas une livraison en cours à afficher, c'est une anomalie
 * oubliée (repéré le 2026-10-16, 21 commandes jusqu'au 28 septembre
 * encombrant la liste réelle d'un livreur). Celles-ci restent en base,
 * inchangées, pour traitement séparé — seul l'affichage change ici.
 */
export async function listerLivraisonsAssignees(livreurId: string): Promise<LivraisonAssignee[]> {
  const supabase = createServiceSupabaseClient();
  const { debut } = plageJourMayotteUtc(dateMayotteIso());

  const { data: livraisons, error: erreurLivraisons } = await supabase
    .from("livraisons")
    .select("commande_id")
    .eq("livreur_id", livreurId)
    .eq("statut", "en_livraison")
    .gte("heure_depart_cuisine", debut.toISOString());

  if (erreurLivraisons) {
    throw new Error(`Impossible de charger les livraisons assignées : ${erreurLivraisons.message}`);
  }
  const idsCommandes = (livraisons ?? []).map((l) => l.commande_id);
  if (idsCommandes.length === 0) {
    return [];
  }

  const { data: commandes, error: erreurCommandes } = await supabase
    .from("commandes")
    .select(
      "id, numero, nom_livraison, adresse_livraison, client_telephone, montant, heure_souhaitee, contenu, nb_plats, paiement_statut, mode_paiement, palier_groupe"
    )
    .in("id", idsCommandes)
    .eq("statut", "pris_par_livreur")
    // Une livraison déjà réglée en ligne (Stripe) ne doit jamais être
    // redemandée en espèces/CB au livreur.
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .order("heure_souhaitee", { ascending: true, nullsFirst: false });

  if (erreurCommandes) {
    throw new Error(`Impossible de charger les commandes : ${erreurCommandes.message}`);
  }

  const livraisonsAssignees: LivraisonAssignee[] = (commandes ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    clientTelephone: c.client_telephone,
    montant: c.montant,
    heureSouhaitee: c.heure_souhaitee,
    lignes: Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : [],
    nbPlats: c.nb_plats,
    palierGroupe: c.palier_groupe as PalierGroupe,
    modePaiement: c.mode_paiement,
  }));

  // Les livraisons ayant atteint un palier "commande groupée" en
  // tête, sans perdre l'ordre chronologique existant à l'intérieur de
  // chaque groupe (tri stable).
  return [...livraisonsAssignees].sort(
    (a, b) => Number(b.palierGroupe !== null) - Number(a.palierGroupe !== null)
  );
}

interface DeclarationLivraison {
  commandeId: string;
  livreurId: string;
  paiements: PaiementDeclare[];
}

/**
 * Déclare le ou les paiements récupérés à la livraison. Ne fait jamais
 * confiance au total calculé côté client : revérifié ici avant tout
 * enregistrement, le total déclaré doit correspondre exactement au montant
 * dû (sinon rejeté, cf. plus bas) — `paiement_statut` passe donc
 * directement à "paye", sans étape intermédiaire "declare" à valider
 * manuellement en caisse (auto-validation, 2026-10-15 : le contrôle du
 * montant a déjà eu lieu ici, un second clic en caisse ne vérifiait rien
 * de plus). `lib/encaissements-livraison.ts` ne reste utile que pour le
 * cas où le livreur n'a jamais déclaré via l'app (filet de secours
 * caisse/patron).
 *
 * Une commande déjà réglée en ligne (Stripe, `mode_paiement === "stripe"`)
 * ne demande aucune déclaration de paiement : rien n'a été encaissé à la
 * livraison, `paiement_statut` est déjà "paye" — on se contente de marquer
 * la livraison faite, jamais de faire payer le client une seconde fois.
 */
export async function declarerLivraison({ commandeId, livreurId, paiements }: DeclarationLivraison): Promise<void> {
  for (const p of paiements) {
    if (!Number.isFinite(p.montant) || p.montant <= 0) {
      throw new Error("Montant de paiement invalide.");
    }
  }

  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, montant, canal, statut, mode_paiement")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison" || commande.statut !== "pris_par_livreur") {
    throw new Error("Cette commande n'est pas en cours de livraison.");
  }

  const { data: livraison } = await supabase
    .from("livraisons")
    .select("livreur_id")
    .eq("commande_id", commandeId)
    .maybeSingle();
  if (!livraison || livraison.livreur_id !== livreurId) {
    throw new Error("Cette livraison n'est pas assignée à ce livreur.");
  }

  if (commande.mode_paiement === "stripe") {
    await changerStatutCommande({ commandeId, statut: "livre", profilId: livreurId, roleMetier: "livreur" });
    return;
  }

  if (paiements.length === 0) {
    throw new Error("Au moins un paiement est requis.");
  }

  const totalDeclare = Math.round(paiements.reduce((total, p) => total + p.montant, 0) * 100) / 100;
  const totalAttendu = Math.round(commande.montant * 100) / 100;
  if (totalDeclare !== totalAttendu) {
    throw new Error(`Le total déclaré (${totalDeclare.toFixed(2)} €) ne correspond pas au montant dû (${totalAttendu.toFixed(2)} €).`);
  }

  const { error: erreurPaiements } = await supabase.from("paiements").insert(
    paiements.map((p) => ({
      commande_id: commandeId,
      montant: p.montant,
      mode: p.mode,
      declare_par_livreur_id: livreurId,
      payeur: p.payeur ?? null,
    }))
  );
  if (erreurPaiements) {
    throw new Error(`Impossible d'enregistrer les paiements : ${erreurPaiements.message}`);
  }

  // Contrairement aux effets de bord "best effort" du reste du code (QR,
  // impression...), un échec ici est critique : la commande resterait
  // indéfiniment non payée alors que l'argent a déjà été récupéré. On fait
  // donc échouer toute la déclaration plutôt que de continuer
  // silencieusement. Le montant est déjà revérifié exactement ci-dessus,
  // donc "paye" directement, jamais "declare" (cf. commentaire de
  // `declarerLivraison`).
  const { error: erreurStatutPaiement } = await supabase
    .from("commandes")
    .update({ paiement_statut: "paye" })
    .eq("id", commandeId);
  if (erreurStatutPaiement) {
    throw new Error(`Impossible d'enregistrer le paiement : ${erreurStatutPaiement.message}`);
  }

  await changerStatutCommande({ commandeId, statut: "livre", profilId: livreurId, roleMetier: "livreur" });
  await notifierPaiementConfirme(commandeId);
}

/**
 * Vérification AVANT toute connexion : un client scanne son reçu une fois
 * la commande déjà livrée/remise/annulée bien plus souvent qu'un livreur
 * ne scanne un ticket légitime (le client ne reçoit son reçu qu'à la
 * remise) — demande explicite du patron, 2026-10-19. Dans ce cas, la page
 * ne doit même pas proposer le pavé PIN du livreur : elle redirige
 * directement vers le site public, avant tout rendu interne.
 */
export async function commandeDuQrCodeEstFinalisee(qrCode: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();

  const { data: livraison } = await supabase.from("livraisons").select("commande_id").eq("qr_code", qrCode).maybeSingle();
  if (!livraison) return false;

  const { data: commande } = await supabase.from("commandes").select("statut").eq("id", livraison.commande_id).maybeSingle();
  if (!commande) return false;

  return commande.statut === "livre" || commande.statut === "remis_au_client" || commande.statut === "annulee";
}

/**
 * Résout l'état d'un ticket scanné (QR imprimé sur le reçu client,
 * `livraisons.qr_code`) pour `/livreur/scan/[code]` — un seul endroit qui
 * décide quoi afficher/proposer, jamais dupliqué entre la page et une
 * éventuelle action. Ne fait jamais confiance à `livreurId` au-delà de
 * déterminer l'état (ex: "a_livrer" seulement si CE livreur a bien la
 * livraison) — les actions elles-mêmes (`prendreLivraisonParQrCode`,
 * `declarerLivraison`) revérifient tout de leur côté.
 */
export async function lireEtatScan(qrCode: string, livreurId: string): Promise<EtatScan> {
  const supabase = createServiceSupabaseClient();

  const { data: livraison, error: erreurLivraison } = await supabase
    .from("livraisons")
    .select("commande_id, livreur_id, livreur_exclu_id")
    .eq("qr_code", qrCode)
    .maybeSingle();
  if (erreurLivraison || !livraison) {
    return { type: "introuvable" };
  }

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select(
      "id, numero, statut, nom_livraison, adresse_livraison, client_telephone, montant, heure_souhaitee, contenu, nb_plats, palier_groupe, mode_paiement"
    )
    .eq("id", livraison.commande_id)
    .maybeSingle();
  if (erreurCommande || !commande) {
    return { type: "introuvable" };
  }

  if (commande.statut === "annulee") {
    return { type: "annulee" };
  }
  if (commande.statut === "en_attente" || commande.statut === "en_preparation") {
    return { type: "pas_prete", numero: commande.numero };
  }

  const livraisonAssignee: LivraisonAssignee = {
    id: commande.id,
    numero: commande.numero,
    nom: commande.nom_livraison ?? "",
    adresse: commande.adresse_livraison,
    clientTelephone: commande.client_telephone,
    montant: commande.montant,
    heureSouhaitee: commande.heure_souhaitee,
    lignes: Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [],
    nbPlats: commande.nb_plats,
    palierGroupe: commande.palier_groupe as PalierGroupe,
    modePaiement: commande.mode_paiement,
  };

  if (commande.statut === "pret") {
    if (livraison.livreur_id) {
      // Statut normalement impossible (l'attribution d'un livreur ne se
      // produit qu'au passage à "pris_par_livreur"), mais ne jamais planter
      // sur un état imprévu : traité comme déjà pris par quelqu'un d'autre.
      const nomLivreur = await nomProfil(supabase, livraison.livreur_id);
      return { type: "deja_prise_autre", numero: commande.numero, nomLivreur };
    }
    return {
      type: "a_prendre",
      commandeId: commande.id,
      livraison: livraisonAssignee,
      exclu: livraison.livreur_exclu_id === livreurId,
    };
  }

  if (commande.statut === "pris_par_livreur") {
    if (livraison.livreur_id === livreurId) {
      return { type: "a_livrer", commandeId: commande.id, livraison: livraisonAssignee };
    }
    const nomLivreur = livraison.livreur_id ? await nomProfil(supabase, livraison.livreur_id) : null;
    return { type: "deja_prise_autre", numero: commande.numero, nomLivreur };
  }

  // "livre" (ou tout autre statut terminal futur) : rien à faire de plus.
  return { type: "deja_livree", numero: commande.numero };
}

async function nomProfil(supabase: ReturnType<typeof createServiceSupabaseClient>, profilId: string): Promise<string | null> {
  const { data } = await supabase.from("profils").select("nom").eq("id", profilId).maybeSingle();
  return data?.nom ?? null;
}

/**
 * Prise en charge par scan : le livreur flashe le QR du ticket dès qu'il le
 * récupère à l'emplacement de sa zone, sans qu'un employé de cuisine n'ait
 * à désigner qui que ce soit (remplace le sélecteur "Choisir le livreur"
 * en cuisine, retiré le 2026-10-15 — trop lent pour 20 commandes/jour).
 *
 * N'appelle PAS `changerStatutCommande` (contrairement aux autres
 * transitions) : c'est le seul endroit où deux personnes différentes
 * peuvent littéralement cliquer sur la même ressource à la même seconde
 * (deux livreurs scannent le même ticket presque en même temps). Un
 * lire-puis-écrire (vérifier `livreur_id`, puis mettre à jour) laisserait
 * passer les deux en cas de course — demande explicite du patron,
 * 2026-10-19 : une seule mise à jour conditionnelle sur `commandes.statut`
 * (`WHERE statut = 'pret'`) décide qui gagne, le `UPDATE` ne retourne une
 * ligne QUE pour celui qui a vraiment changé le statut.
 */
export async function prendreLivraisonParQrCode(qrCode: string, livreurId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: livraison, error } = await supabase
    .from("livraisons")
    .select("commande_id, livreur_exclu_id")
    .eq("qr_code", qrCode)
    .maybeSingle();
  if (error || !livraison) {
    throw new Error("Ticket introuvable.");
  }
  if (livraison.livreur_exclu_id === livreurId) {
    throw new Error("Tu viens de relâcher cette livraison — un collègue ou le comptoir doit la reprendre.");
  }

  const { data: commandeGagnee, error: erreurClaim } = await supabase
    .from("commandes")
    .update({ statut: "pris_par_livreur", statut_change_le: new Date().toISOString() })
    .eq("id", livraison.commande_id)
    .eq("statut", "pret")
    .select("id")
    .maybeSingle();
  if (erreurClaim) {
    throw new Error(`Impossible de prendre la livraison : ${erreurClaim.message}`);
  }
  if (!commandeGagnee) {
    throw new Error("Cette livraison a déjà été prise par quelqu'un d'autre.");
  }

  const { error: erreurLivreur } = await supabase
    .from("livraisons")
    .update({
      livreur_id: livreurId,
      statut: "en_livraison",
      heure_depart_cuisine: new Date().toISOString(),
      livreur_exclu_id: null,
    })
    .eq("commande_id", livraison.commande_id);
  if (erreurLivreur) {
    console.error("[livreur/commandes] échec attribution livreur après prise atomique :", erreurLivreur.message);
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: livraison.commande_id, statut: "pris_par_livreur", profil_id: livreurId, role_metier: "livreur" });
  if (erreurEvenement) {
    console.error("[livreur/commandes] échec journalisation prise de livraison :", erreurEvenement.message);
  }
}

/**
 * Le livreur ne peut pas remettre la commande (client absent, adresse
 * introuvable, refusée...) — contrairement à un paiement qui manque
 * (`declarerLivraison`), on ne redemande jamais une déclaration : la
 * commande reste au statut "pris_par_livreur" (jamais "livre", ce serait
 * faux), mais un responsable est alerté immédiatement par email pour
 * décider de la suite en interne. Réutilise les colonnes `alerte_*`
 * existantes (déjà utilisées côté caisse pour un écart de paiement, cf.
 * `signalerEcartLivraison`), juste déclenchable directement depuis le
 * scan, là où le problème se produit réellement.
 */
export async function signalerLivraisonNonEffectuee(
  commandeId: string,
  livreurId: string,
  nomLivreur: string,
  motif: string
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, canal, statut")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison" || commande.statut !== "pris_par_livreur") {
    throw new Error("Cette commande n'est pas en cours de livraison.");
  }

  const { data: livraison } = await supabase.from("livraisons").select("livreur_id").eq("commande_id", commandeId).maybeSingle();
  if (!livraison || livraison.livreur_id !== livreurId) {
    throw new Error("Cette livraison n'est pas assignée à ce livreur.");
  }

  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({
      alerte_signalee: true,
      alerte_note: motif.trim() || "Livraison impossible (motif non précisé par le livreur)",
      alerte_signalee_par: livreurId,
      alerte_signalee_le: new Date().toISOString(),
    })
    .eq("id", commandeId);
  if (erreurMaj) {
    throw new Error(`Impossible d'enregistrer le signalement : ${erreurMaj.message}`);
  }

  await notifierLivraisonNonEffectuee(commandeId, motif.trim() || "non précisé", nomLivreur);
}

/**
 * Relâche une livraison déjà prise en charge (le livreur ne peut plus la
 * faire — panne, fin de tournée — ou change de tournée en cours de route) :
 * la commande redevient "prête" et repart au pot commun, qu'elle soit
 * redéposée au resto ou remise en main à un collègue sur la route — dans
 * les deux cas, c'est le même geste (rescanner le QR) qui l'attribue à
 * nouveau, rien de plus à construire pour distinguer les deux cas.
 *
 * Appelable par le livreur lui-même (`roleMetier: "livreur"`, doit être
 * celui à qui la livraison est assignée) ou par le comptoir en forçant
 * (`roleMetier: "comptoir"`, pas de vérification de propriétaire — demande
 * explicite du patron, 2026-10-20, pour couvrir le cas où le livreur ne
 * peut pas agir lui-même).
 */
export async function relacherLivraison(commandeId: string, profilId: string, roleMetier: RoleMetier): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, canal, statut")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison" || commande.statut !== "pris_par_livreur") {
    throw new Error("Cette commande n'est pas en cours de livraison.");
  }

  const { data: livraison } = await supabase.from("livraisons").select("livreur_id").eq("commande_id", commandeId).maybeSingle();
  if (!livraison) {
    throw new Error("Livraison introuvable.");
  }
  if (roleMetier === "livreur" && livraison.livreur_id !== profilId) {
    throw new Error("Cette livraison n'est pas assignée à toi.");
  }

  const livreurExclu = livraison.livreur_id;

  const { data: commandeRelachee, error: erreurRelacher } = await supabase
    .from("commandes")
    .update({ statut: "pret", statut_change_le: new Date().toISOString() })
    .eq("id", commandeId)
    .eq("statut", "pris_par_livreur")
    .select("id")
    .maybeSingle();
  if (erreurRelacher) {
    throw new Error(`Impossible de relâcher la livraison : ${erreurRelacher.message}`);
  }
  if (!commandeRelachee) {
    throw new Error("Cette commande n'est plus en cours de livraison.");
  }

  const { error: erreurLivraisonMaj } = await supabase
    .from("livraisons")
    .update({ statut: "en_attente", livreur_id: null, livreur_exclu_id: livreurExclu, heure_depart_cuisine: null })
    .eq("commande_id", commandeId);
  if (erreurLivraisonMaj) {
    console.error("[livreur/commandes] échec remise en attente après relâchement :", erreurLivraisonMaj.message);
  }

  const { error: erreurEvenement } = await supabase
    .from("commandes_evenements")
    .insert({ commande_id: commandeId, statut: "pret", profil_id: profilId, role_metier: roleMetier });
  if (erreurEvenement) {
    console.error("[livreur/commandes] échec journalisation relâchement :", erreurEvenement.message);
  }
}
