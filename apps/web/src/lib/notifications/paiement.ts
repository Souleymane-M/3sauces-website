import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Canal } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import { nomSansMultiplicateur } from "@/lib/pieces-produit";
import { MONTANT_RECOMPENSE, SEUIL_AFFICHAGE_EXACT, SEUIL_RECOMPENSE, progressionFideliteCommande } from "@/lib/fidelite/regles";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { envoyerEmail } from "./email";
import { construireEmailClientHtml } from "./template";

interface ClientFidelite {
  email: string | null;
  montant_cumule: number;
  recompense_disponible: boolean;
}

/**
 * Bloc fidélité de l'email de confirmation — jamais un message générique
 * identique pour tout le monde, toujours le vrai statut du client juste
 * après cette commande (répond à "une cliente a 17 tampons sans le
 * savoir"). `recompenseAppliquee` prime sur tout le reste : après avoir
 * consommé sa récompense, `montant_cumule` vient d'être remis à 0 par le
 * trigger, donc "+1 tampon" ou "plus que Xx€" n'aurait aucun sens ici.
 */
function construireBlocFidelite(
  client: ClientFidelite,
  montantCommande: number,
  recompenseAppliquee: boolean
): { html: string; texteBouton: string } {
  if (recompenseAppliquee) {
    return {
      html: `<p>Ta récompense de ${MONTANT_RECOMPENSE}€ a bien été utilisée sur cette commande — merci de ta fidélité !</p>`,
      texteBouton: "Retourner sur le site",
    };
  }

  if (client.recompense_disponible) {
    return {
      html: `<p>Tu as ${MONTANT_RECOMPENSE}€ à utiliser dès ta prochaine commande !</p>`,
      texteBouton: "Commander maintenant",
    };
  }

  if (client.montant_cumule > SEUIL_AFFICHAGE_EXACT) {
    const restant = (SEUIL_RECOMPENSE - client.montant_cumule).toFixed(2);
    return {
      html: `<p>Plus que ${restant}€ et tu débloques ${MONTANT_RECOMPENSE}€ offerts !</p>`,
      texteBouton: "Retourner sur le site",
    };
  }

  // Estimation à partir du cumul déjà à jour (après cette commande) — jamais
  // exacte en cas de commandes concurrentes, mais une approximation très
  // largement suffisante pour un seul restaurant.
  const montantCumuleAvant = Math.max(0, client.montant_cumule - montantCommande);
  const { tamponsGagnes, montantProchainTampon } = progressionFideliteCommande(montantCommande, montantCumuleAvant);
  const html =
    tamponsGagnes > 0
      ? `<p>+${tamponsGagnes} tampon${tamponsGagnes > 1 ? "s" : ""} avec cette commande ! Continue à cumuler pour débloquer ${MONTANT_RECOMPENSE}€ offerts.</p>`
      : `<p>Continue à cumuler pour débloquer ${MONTANT_RECOMPENSE}€ offerts — encore ${montantProchainTampon.toFixed(2)}€ pour ton prochain tampon.</p>`;
  return { html, texteBouton: "Retourner sur le site" };
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
      `Et si vous êtes plusieurs, commandez en groupe : même avantage, moins d'attente pour tout le monde.</p>`
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
      "numero, montant, contenu, nom_livraison, client_telephone, recompense_appliquee, nb_plats, palier_groupe, mode_paiement, canal"
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

  let client: ClientFidelite | null = null;
  if (commande.client_telephone) {
    const { data } = await supabase
      .from("clients")
      .select("email, montant_cumule, recompense_disponible")
      .eq("telephone", commande.client_telephone)
      .maybeSingle();
    client = data;
  }

  const envois: Promise<{ ok: boolean; erreur?: string }>[] = [];

  if (client?.email) {
    const blocFidelite = construireBlocFidelite(client, commande.montant, commande.recompense_appliquee);
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
        client.email,
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
