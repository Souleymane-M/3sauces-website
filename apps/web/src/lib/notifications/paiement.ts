import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Canal } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { nomSansMultiplicateur } from "@/lib/pieces-produit";
import { MONTANT_RECOMPENSE, messageFidelite } from "@/lib/fidelite/regles";
import { compterTamponsDisponibles } from "@/lib/fidelite/tampons";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { envoyerEmail } from "./email";
import { construireEmailClientHtml } from "./template";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@3sauces/supabase";

/**
 * Bloc fidélité de l'email de confirmation — jamais un message générique
 * identique pour tout le monde, toujours le vrai statut du client juste
 * après cette commande (répond à "une cliente a 17 tampons sans le
 * savoir"). Appelée après que le trigger de paiement ait tourné : les
 * tampons consommés/obtenus par CETTE commande sont déjà reflétés dans
 * `fidelite_tampons`/`clients.montant_cumule`.
 */
async function construireBlocFidelite(
  supabase: SupabaseClient<Database>,
  telephone: string,
  tamponsUtilises: number
): Promise<{ html: string; texteBouton: string }> {
  if (tamponsUtilises > 0) {
    const { nombre } = await compterTamponsDisponibles(supabase, telephone);
    const reste = nombre > 0 ? `<p>Il te reste ${nombre} tampon${nombre > 1 ? "s" : ""} disponible${nombre > 1 ? "s" : ""}.</p>` : "";
    return {
      html: `<p>Tu as utilisé ${tamponsUtilises} tampon${tamponsUtilises > 1 ? "s" : ""} (-${(tamponsUtilises * MONTANT_RECOMPENSE).toFixed(2)}€) sur cette commande — merci de ta fidélité !</p>${reste}`,
      texteBouton: "Retourner sur le site",
    };
  }

  const { nombre, prochaineExpiration } = await compterTamponsDisponibles(supabase, telephone);
  if (nombre > 0) {
    return {
      html: `<p>${messageFidelite({ nombre, prochaineExpiration })}</p>`,
      texteBouton: "Commander maintenant",
    };
  }

  const { data: clientRow } = await supabase.from("clients").select("montant_cumule").eq("telephone", telephone).maybeSingle();
  const reliquat = clientRow?.montant_cumule ?? 0;
  const montantProchainTampon = reliquat === 0 ? MONTANT_RECOMPENSE : MONTANT_RECOMPENSE - reliquat;
  return {
    html: `<p>Continue à cumuler pour débloquer ${MONTANT_RECOMPENSE}€ offerts — encore ${montantProchainTampon.toFixed(2)}€ pour ton prochain tampon.</p>`,
    texteBouton: "Retourner sur le site",
  };
}

/**
 * Bloc commande groupée — incite à essayer la prochaine fois si ce n'était
 * pas le cas, confirme l'avantage obtenu si le palier a été atteint, ne dit
 * rien si la commande était groupée mais sous le seuil (jamais souligner un
 * bonus manqué juste après le paiement). L'incitation "prochaine fois"
 * dépend du canal : "livraison prioritaire" n'a de sens que pour une
 * livraison — pour quelqu'un venu sur place/à emporter, l'argument qui
 * compte est d'éviter la queue en commandant depuis le site à l'avance.
 */
function construireBlocGroupe(nbPlats: number, palierGroupe: PalierGroupe, canal: Canal): string | null {
  if (nbPlats === 0) {
    if (canal === "livraison") {
      return (
        `<p>La prochaine fois, commande en groupe avant 11h :<br>` +
        `Dès 3 plats et 30€ → livraison prioritaire.<br>` +
        `Dès 4 plats et 40€ → priorité + une boisson 2L offerte.</p>`
      );
    }
    return (
      `<p>La prochaine fois, commande directement sur 3sauces.fr avant de venir — tu évites la queue.<br>` +
      `Et si vous êtes plusieurs, commandez en groupe pour une préparation prioritaire :<br>` +
      `Dès 3 plats et 30€ → commande prioritaire.<br>` +
      `Dès 4 plats et 40€ → commande prioritaire + une boisson 2L offerte.</p>`
    );
  }
  if (palierGroupe === "GROUPE_4") {
    return `<p>Livraison prioritaire + boisson 2L offerte activées pour cette commande.</p>`;
  }
  if (palierGroupe === "GROUPE_3") {
    return `<p>Livraison prioritaire activée pour cette commande.</p>`;
  }
  return null;
}

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
export async function notifierCommandeRecue(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select("numero, montant, contenu, client_telephone, nb_plats, palier_groupe, canal")
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable (réception) :", commandeId, error?.message);
    return;
  }

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);
  const blocGroupe = construireBlocGroupe(commande.nb_plats, commande.palier_groupe as PalierGroupe, commande.canal);
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
          `Commande reçue — commande #${commande.numero}`,
          construireEmailClientHtml(
            `<p>Merci, ta commande #${commande.numero} (<strong>${montantAffiche} €</strong>) est bien enregistrée.</p>` +
              `<p>${resume}</p>` +
              (blocGroupe ?? ""),
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
        `<p><strong>Nouvelle commande reçue (pas encore payée).</strong></p>` +
          `<p>Commande #${commande.numero} — ${montantAffiche} €</p>` +
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
 * Notifie un paiement confirmé (comptoir, livraison, ou en ligne via le
 * webhook Stripe) — appelé après que `commandes.paiement_statut` soit
 * effectivement passé à "paye" (donc après que le trigger de fidélité ait
 * déjà mis à jour `clients`). Uniquement par email pour l'instant (pas de
 * SMS configuré). Best effort : un échec (email non configuré, domaine non
 * vérifié) ne doit jamais faire échouer le paiement lui-même déjà
 * enregistré — chaque envoi est indépendant (`Promise.allSettled`).
 */
export async function notifierPaiementConfirme(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: commande, error } = await supabase
    .from("commandes")
    .select(
      "numero, montant, contenu, nom_livraison, client_telephone, tampons_utilises, nb_plats, palier_groupe, mode_paiement, canal"
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !commande) {
    console.error("[notifications/paiement] commande introuvable :", commandeId, error?.message);
    return;
  }

  const lignes = Array.isArray(commande.contenu) ? (commande.contenu as LigneCommande[]) : [];
  const resume = lignes.map((l) => `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`).join(", ") || "—";
  const montantAffiche = commande.montant.toFixed(2);

  const emailRestaurant = process.env.NOTIF_RESTAURANT_EMAIL || null;

  let clientEmail: string | null = null;
  if (commande.client_telephone) {
    const { data } = await supabase.from("clients").select("email").eq("telephone", commande.client_telephone).maybeSingle();
    clientEmail = data?.email ?? null;
  }

  const envois: Promise<{ ok: boolean; erreur?: string }>[] = [];

  if (clientEmail && commande.client_telephone) {
    const blocFidelite = await construireBlocFidelite(supabase, commande.client_telephone, commande.tampons_utilises);
    const blocGroupe = construireBlocGroupe(commande.nb_plats, commande.palier_groupe as PalierGroupe, commande.canal);

    // Un paiement en ligne (Stripe) est bien une confirmation pour le
    // client — il ne sait pas encore que ça a abouti. Payé en personne
    // (comptoir ou au livreur), il le sait déjà en recevant cet email :
    // "paiement confirmé" n'a pas de sens, "commande reçue" si.
    const payeEnLigne = commande.mode_paiement === "stripe";
    const sujet = payeEnLigne ? `Paiement confirmé — commande #${commande.numero}` : `Commande reçue — commande #${commande.numero}`;
    const intro = payeEnLigne
      ? `<p>Merci, ton paiement de <strong>${montantAffiche} €</strong> pour la commande #${commande.numero} est confirmé.</p>`
      : `<p>Merci, ta commande #${commande.numero} (<strong>${montantAffiche} €</strong>) est bien enregistrée.</p>`;

    envois.push(
      envoyerEmail(
        clientEmail,
        sujet,
        construireEmailClientHtml(intro + `<p>${resume}</p>` + blocFidelite.html + (blocGroupe ?? ""), blocFidelite.texteBouton),
        emailRestaurant ?? undefined
      )
    );
  }

  if (emailRestaurant) {
    envois.push(
      envoyerEmail(
        emailRestaurant,
        `Paiement reçu — commande #${commande.numero}`,
        `<p><strong>Nouveau paiement confirmé.</strong></p>` +
          `<p>Commande #${commande.numero} — ${montantAffiche} €</p>` +
          `<p>Client : ${commande.nom_livraison ?? "—"} — ${commande.client_telephone ?? "—"}</p>` +
          `<p>${resume}</p>`
      )
    );
  }

  const resultats = await Promise.allSettled(envois);
  for (const resultat of resultats) {
    if (resultat.status === "fulfilled" && !resultat.value.ok) {
      console.error("[notifications/paiement] échec envoi :", resultat.value.erreur);
    } else if (resultat.status === "rejected") {
      console.error("[notifications/paiement] envoi rejeté :", resultat.reason);
    }
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
