import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { nomSansMultiplicateur } from "@/lib/pieces-produit";
import { envoyerEmail } from "./email";
import { construireEmailClientHtml } from "./template";

/** « en espèces », « par carte »… tel que dit au client et au restaurant. */
function libellePaiement(mode: string | null, canal?: string): string {
  switch (mode) {
    case "especes":
      return canal === "livraison" ? "en espèces à la livraison" : "en espèces";
    case "cb":
      return canal === "livraison" ? "par carte à la livraison" : "par carte";
    case "stripe":
      return "en ligne par carte";
    case "mixte":
      return "en espèces et par carte";
    default:
      return "";
  }
}

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Confirme la bonne réception d'une commande du site public payée en
 * personne (espèces/CB au comptoir ou à la livraison) — jamais pour
 * Stripe, où la confirmation n'a de sens qu'une fois le paiement réellement
 * passé (cf. `notifierPaiementConfirme`, déclenché par le webhook).
 *
 * Distincte de `notifierPaiementConfirme` : appelée tout de suite à la
 * création, donc AVANT que le trigger de fidélité n'ait tourné (il ne se
 * déclenche qu'au passage de `paiement_statut` à "paye", qui pour une
 * commande payée en personne n'arrive que plus tard, à l'encaissement réel).
 * Pas de bloc fidélité ici pour ne jamais afficher un cumul pas encore à
 * jour — seulement la confirmation + le bloc commande groupée, qui ne
 * dépend d'aucune donnée mise à jour par le trigger.
 *
 * Sans cet envoi immédiat, un client payant en espèces ne recevait aucun
 * email avant l'encaissement réel (parfois des heures plus tard pour une
 * livraison) — repéré le 2026-10-05 après une vague de commandes sans
 * aucune confirmation reçue.
 */
export async function notifierCommandeRecue(commandeId: string, payeeEnLigne: boolean = false): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select("numero, montant, contenu, client_telephone, prenom, canal, mode_paiement")
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable (réception) :", commandeId, error?.message);
    return;
  }

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);
  const prenomBrut = commande.prenom?.trim() || null;
  const prenom = prenomBrut ? echapper(prenomBrut) : null;
  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;

  const envois: Promise<{ ok: boolean; erreur?: string }>[] = [];

  if (commande.client_telephone) {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("telephone", commande.client_telephone)
      .maybeSingle();

    if (client?.email) {
      envois.push(
        envoyerEmail(
          client.email,
          prenomBrut ? `Merci ${prenomBrut}, ta commande #${commande.numero} est bien reçue` : `Ta commande #${commande.numero} est bien reçue`,
          construireEmailClientHtml(
            `<p>Merci${prenom ? ` ${prenom}` : ""} pour ta commande ! La #${commande.numero} (<strong>${montantAffiche} €</strong>) est bien enregistrée.</p>` +
              `<p>${resume}</p>` +
              (payeeEnLigne
                ? `<p>Paiement : <strong>payé en ligne par carte</strong>.</p>`
                : libellePaiement(commande.mode_paiement, commande.canal)
                  ? `<p>Paiement prévu : <strong>${libellePaiement(commande.mode_paiement, commande.canal)}</strong>.</p>`
                  : "") +
              `<p>Pour être ${commande.canal === "livraison" ? "livré" : "servi"} à l'heure prévue, commande le plus tôt possible : plus tu commandes tôt, plus on est ponctuels.</p>` +
              `<p>À très vite chez 3 Sauces !</p>`,
            "Retourner sur le site"
          ),
          emailRestaurant ?? undefined
        )
      );
    }
  }

  // Jusqu'ici le restaurant n'apparaissait qu'en Reply-To de l'email client
  // (ça n'envoie rien dans sa boîte) — aucune commande non encore payée
  // (livraison, site public) ne lui était donc jamais signalée par email.
  // Repéré le 2026-10-06 : seules les commandes déjà payées apparaissaient
  // dans la boîte du restaurant.
  if (emailRestaurant) {
    envois.push(
      envoyerEmail(
        emailRestaurant,
        `Nouvelle commande — commande #${commande.numero}`,
        (payeeEnLigne
          ? `<p><strong>Nouvelle commande reçue, payée en ligne par carte.</strong></p>` +
            `<p>Commande #${commande.numero} — ${montantAffiche} €</p>`
          : `<p><strong>Nouvelle commande reçue (pas encore payée).</strong></p>` +
            `<p>Commande #${commande.numero} — ${montantAffiche} €${libellePaiement(commande.mode_paiement, commande.canal) ? ` — paiement prévu ${libellePaiement(commande.mode_paiement, commande.canal)}` : ""}</p>`) +
          `<p>${resume}</p>`
      )
    );
  }

  const resultats = await Promise.allSettled(envois);
  for (const resultat of resultats) {
    if (resultat.status === "fulfilled" && !resultat.value.ok) {
      console.error("[notifications/paiement] échec envoi réception :", resultat.value.erreur);
    } else if (resultat.status === "rejected") {
      console.error("[notifications/paiement] envoi réception rejeté :", resultat.reason);
    }
  }
}

/**
 * Appelée quand une commande passe à « payée » (comptoir, livraison, ou en ligne via le webhook Stripe). Plus aucun
 * e-mail « paiement reçu » nulle part (demande du patron, 2026-11-16) : le client ne reçoit qu'un seul message, celui de
 * commande reçue. Une commande payée en ligne n'en a pas reçu à sa création (le paiement n'était pas acquis) : c'est
 * donc ici, une fois le paiement confirmé, qu'on lui envoie ce même message de commande reçue, ainsi qu'au restaurant.
 */
export async function notifierPaiementConfirme(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande } = await supabase.from("commandes").select("mode_paiement").eq("id", commandeId).maybeSingle();
  if (commande?.mode_paiement === "stripe") {
    await notifierCommandeRecue(commandeId, true);
  }
}

/**
 * Notifie l'annulation d'une commande — n'existait pas jusqu'ici, un client
 * n'était prévenu par aucun canal (repéré le 2026-10-06, en même temps que
 * le trou sur la modification). Le remboursement réel (espèces ou carte)
 * reste entièrement manuel, hors de l'app (cf. lib/cuisine/commandes.ts) —
 * cet email prévient seulement, il ne déclenche ni ne suit aucun
 * remboursement. Si la commande était déjà payée, le restaurant reçoit un
 * rappel explicite pour ne pas l'oublier.
 */
export async function notifierCommandeAnnulee(commandeId: string, motif: string | null): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select("numero, montant, contenu, nom_livraison, client_telephone, paiement_statut, mode_paiement")
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable (annulation) :", commandeId, error?.message);
    return;
  }

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);
  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;
  const dejaPayee = commande.paiement_statut === "paye";

  const envois: Promise<{ ok: boolean; erreur?: string }>[] = [];

  if (commande.client_telephone) {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("telephone", commande.client_telephone)
      .maybeSingle();

    if (client?.email) {
      envois.push(
        envoyerEmail(
          client.email,
          `Commande annulée — commande #${commande.numero}`,
          construireEmailClientHtml(
            `<p>Ta commande #${commande.numero} (<strong>${montantAffiche} €</strong>) a été annulée.</p>` +
              `<p>${resume}</p>` +
              (motif ? `<p>Motif : ${motif}</p>` : "") +
              (dejaPayee
                ? `<p>Elle avait déjà été payée — le remboursement sera traité séparément par le restaurant.</p>`
                : ""),
            "Retourner sur le site"
          ),
          emailRestaurant ?? undefined
        )
      );
    }
  }

  if (emailRestaurant) {
    envois.push(
      envoyerEmail(
        emailRestaurant,
        `Commande annulée — commande #${commande.numero}`,
        `<p><strong>Commande annulée.</strong></p>` +
          `<p>Commande #${commande.numero} — ${montantAffiche} €</p>` +
          `<p>Client : ${commande.nom_livraison ?? "—"} — ${commande.client_telephone ?? "—"}</p>` +
          `<p>${resume}</p>` +
          (motif ? `<p>Motif : ${motif}</p>` : "") +
          (dejaPayee
            ? `<p><strong>IMPORTANT : déjà payée (${commande.mode_paiement}) — penser au remboursement manuel.</strong></p>`
            : "")
      )
    );
  }

  const resultats = await Promise.allSettled(envois);
  for (const resultat of resultats) {
    if (resultat.status === "fulfilled" && !resultat.value.ok) {
      console.error("[notifications/paiement] échec envoi annulation :", resultat.value.erreur);
    } else if (resultat.status === "rejected") {
      console.error("[notifications/paiement] envoi annulation rejeté :", resultat.reason);
    }
  }
}

/**
 * Notifie la modification d'une commande — même constat que l'annulation :
 * n'existait pas jusqu'ici. Un seul email au client (avec le restaurant en
 * copie via Reply-To comme `notifierCommandeRecue`), pas d'email interne
 * séparé : contrairement à une annulation, c'est toujours l'équipe
 * elle-même qui modifie depuis /caisse — elle est donc déjà au courant.
 */
export async function notifierCommandeModifiee(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select("numero, montant, contenu, client_telephone")
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable (modification) :", commandeId, error?.message);
    return;
  }

  if (!commande.client_telephone) return;
  const { data: client } = await supabase
    .from("clients")
    .select("email")
    .eq("telephone", commande.client_telephone)
    .maybeSingle();
  if (!client?.email) return;

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);
  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;

  const resultat = await envoyerEmail(
    client.email,
    `Commande modifiée — commande #${commande.numero}`,
    construireEmailClientHtml(
      `<p>Ta commande #${commande.numero} a été modifiée.</p>` +
        `<p>${resume}</p>` +
        `<p>Nouveau total : <strong>${montantAffiche} €</strong></p>`,
      "Retourner sur le site"
    ),
    emailRestaurant ?? undefined
  );
  if (!resultat.ok) {
    console.error("[notifications/paiement] échec envoi modification :", resultat.erreur);
  }
}

/**
 * Alerte immédiate au restaurant quand une livraison n'a pas pu être
 * remise au client (absent, adresse introuvable, refusée...) — demande
 * explicite du patron, 2026-10-16 : contrairement à un échec de paiement,
 * la commande ne doit jamais revenir silencieusement dans le circuit (le
 * plat est froid entre-temps), un responsable doit être alerté tout de
 * suite pour décider de la suite en interne. Aucun email client ici —
 * seulement le restaurant.
 */
/** Alerte au restaurant : livraison payée en partie seulement (un client est parti sans payer). Seul le restaurant est prévenu. */
export async function notifierPaiementPartiel(
  commandeId: string,
  recu: number,
  attendu: number,
  motif: string,
  nomLivreur: string,
  plats: string[] = []
): Promise<void> {
  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;
  if (!emailRestaurant) return;

  const supabase = createServiceSupabaseClient();
  const { data: commande } = await supabase
    .from("commandes")
    .select("numero, contenu, nom_livraison, adresse_livraison, client_telephone")
    .eq("id", commandeId)
    .maybeSingle();
  if (!commande) return;

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const resultat = await envoyerEmail(
    emailRestaurant,
    `⚠️ Paiement partiel — commande #${commande.numero}`,
    `<p><strong>${nomLivreur}</strong> a livré la commande #${commande.numero} avec un paiement partiel.</p>` +
      `<p>Reçu : <strong>${recu.toFixed(2)} €</strong> sur ${attendu.toFixed(2)} € — reste <strong>${(attendu - recu).toFixed(2)} €</strong> non payé.</p>` +
      `<p>Motif : ${motif}</p>` +
      (plats.length > 0 ? `<p>Non récupéré : <strong>${plats.join(", ")}</strong></p>` : "") +
      `<p>Client : ${commande.nom_livraison ?? "—"} — ${commande.client_telephone ?? "—"}</p>` +
      `<p>Adresse : ${commande.adresse_livraison ?? "—"}</p>` +
      `<p>${resume}</p>`
  );
  if (!resultat.ok) {
    console.error("[notifications/paiement] échec envoi alerte paiement partiel :", resultat.erreur);
  }
}

export async function notifierLivraisonNonEffectuee(commandeId: string, motif: string, nomLivreur: string): Promise<void> {
  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;
  if (!emailRestaurant) return;

  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select("numero, montant, contenu, nom_livraison, adresse_livraison, client_telephone, paiement_statut")
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable (livraison non effectuée) :", commandeId, error?.message);
    return;
  }

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);
  const dejaPayee = commande.paiement_statut === "paye";

  const resultat = await envoyerEmail(
    emailRestaurant,
    `🚨 Livraison non effectuée — commande #${commande.numero}`,
    `<p><strong>${nomLivreur}</strong> n'a pas pu livrer la commande #${commande.numero}.</p>` +
      `<p>Motif : ${motif || "non précisé"}</p>` +
      `<p>Client : ${commande.nom_livraison ?? "—"} — ${commande.client_telephone ?? "—"}</p>` +
      `<p>Adresse : ${commande.adresse_livraison ?? "—"}</p>` +
      `<p>Montant : ${montantAffiche} € — ${dejaPayee ? "déjà payée en ligne" : "non payée"}</p>` +
      `<p>${resume}</p>`
  );
  if (!resultat.ok) {
    console.error("[notifications/paiement] échec envoi alerte livraison non effectuée :", resultat.erreur);
  }
}
