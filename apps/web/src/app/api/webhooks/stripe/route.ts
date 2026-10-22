import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { notifierPaiementConfirme } from "@/lib/notifications/paiement";
import { annulerCommande } from "@/lib/cuisine/commandes";

const NOM_PROFIL_SYSTEME = "Système (nettoyage automatique)";

/**
 * Seule source de vérité pour le passage d'une commande Stripe à "paye" —
 * jamais le client, jamais le simple retour de redirection sur
 * /commande-confirmee (qui peut arriver avant ou après cet événement,
 * l'ordre n'est jamais garanti). Signature vérifiée avant tout traitement :
 * un payload non signé ne peut venir que d'une requête forgée.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const corpsBrut = await request.text();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let evenement: Stripe.Event;
  try {
    if (!signature) throw new Error("Signature manquante.");
    evenement = stripe.webhooks.constructEvent(corpsBrut, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (erreur) {
    console.error("[/api/webhooks/stripe] signature invalide :", erreur);
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (evenement.type === "checkout.session.completed") {
    const session = evenement.data.object as Stripe.Checkout.Session;
    const supabase = createServiceSupabaseClient();

    const { data: paiement, error: erreurPaiement } = await supabase
      .from("paiements")
      .select("commande_id")
      .eq("stripe_payment_id", session.id)
      .maybeSingle();

    if (erreurPaiement) {
      console.error("[/api/webhooks/stripe] échec lecture paiements :", erreurPaiement.message);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    }
    if (!paiement?.commande_id) {
      console.error("[/api/webhooks/stripe] session sans commande correspondante :", session.id);
      return NextResponse.json({ received: true });
    }

    const { data: commande, error: erreurCommande } = await supabase
      .from("commandes")
      .select("paiement_statut")
      .eq("id", paiement.commande_id)
      .maybeSingle();

    if (erreurCommande) {
      console.error("[/api/webhooks/stripe] échec lecture commande :", erreurCommande.message);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    }

    // Idempotence : Stripe peut renvoyer le même événement plusieurs fois.
    if (commande?.paiement_statut !== "paye") {
      const { error: erreurMaj } = await supabase
        .from("commandes")
        .update({ paiement_statut: "paye" })
        .eq("id", paiement.commande_id);

      if (erreurMaj) {
        console.error("[/api/webhooks/stripe] échec mise à jour commande :", erreurMaj.message);
        return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
      }

      await notifierPaiementConfirme(paiement.commande_id);
    }
  } else if (evenement.type === "checkout.session.expired") {
    // Panier abandonné (session expirée après 30 min, cf.
    // /api/commande/paiement) : annule automatiquement la commande pour
    // libérer le stock et tout tampon fidélité réservé, plutôt que de les
    // laisser bloqués indéfiniment en attendant qu'un humain remarque la
    // commande fantôme (vécu réellement, commande #455, 2026-10-21).
    const session = evenement.data.object as Stripe.Checkout.Session;
    const supabase = createServiceSupabaseClient();

    const { data: paiement, error: erreurPaiement } = await supabase
      .from("paiements")
      .select("commande_id")
      .eq("stripe_payment_id", session.id)
      .maybeSingle();
    if (erreurPaiement || !paiement?.commande_id) {
      console.error("[/api/webhooks/stripe] session expirée sans commande correspondante :", session.id, erreurPaiement?.message);
      return NextResponse.json({ received: true });
    }

    const { data: commande } = await supabase
      .from("commandes")
      .select("statut, paiement_statut")
      .eq("id", paiement.commande_id)
      .maybeSingle();
    // Déjà payée (completed arrivé juste avant expired) ou déjà traitée
    // autrement (statut avancé, annulée manuellement) : rien à faire.
    if (!commande || commande.paiement_statut === "paye" || commande.statut !== "en_attente") {
      return NextResponse.json({ received: true });
    }

    const { data: profilSysteme } = await supabase.from("profils").select("id").eq("nom", NOM_PROFIL_SYSTEME).maybeSingle();
    if (!profilSysteme) {
      console.error("[/api/webhooks/stripe] profil système introuvable, impossible d'annuler :", paiement.commande_id);
      return NextResponse.json({ received: true });
    }

    try {
      await annulerCommande({
        commandeId: paiement.commande_id,
        profilId: profilSysteme.id,
        motif: "Paiement en ligne non finalisé (session Stripe expirée après 30 min) — annulation automatique.",
      });
    } catch (e) {
      console.error("[/api/webhooks/stripe] échec annulation automatique :", paiement.commande_id, e);
    }
  }

  return NextResponse.json({ received: true });
}
