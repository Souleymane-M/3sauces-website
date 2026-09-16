import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceSupabaseClient } from "@3sauces/supabase";

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
    }
  } else if (evenement.type === "checkout.session.expired") {
    // La commande reste "non_paye" par design — le client peut réessayer.
    console.log("[/api/webhooks/stripe] session expirée :", (evenement.data.object as Stripe.Checkout.Session).id);
  }

  return NextResponse.json({ received: true });
}
