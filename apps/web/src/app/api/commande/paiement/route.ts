import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { limiterDebit } from "@/lib/auth/rate-limit";

const MAX_APPELS_PAR_FENETRE = 10;
const FENETRE_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Démarre le paiement en ligne (Stripe Checkout) d'une commande déjà créée
 * via /api/commande (mode_paiement: "stripe", paiement_statut: "non_paye").
 * Étape volontairement séparée de la création de la commande : si l'appel à
 * Stripe échoue, la commande existe déjà et reste réessayable, sans jamais
 * risquer de doublon. Le passage effectif à "paye" n'a jamais lieu ici — il
 * n'arrive que via /api/webhooks/stripe, seule source de vérité.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  if (limiterDebit(`commande-paiement:${ip}`, MAX_APPELS_PAR_FENETRE, FENETRE_RATE_LIMIT_MS)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as { commandeId?: string } | null;
  const commandeId = typeof body?.commandeId === "string" ? body.commandeId : null;
  if (!commandeId) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, numero, montant, canal, mode_paiement, paiement_statut")
    .eq("id", commandeId)
    .maybeSingle();

  if (erreurCommande) {
    console.error("[/api/commande/paiement] échec lecture commande :", erreurCommande.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }
  if (!commande) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (commande.mode_paiement !== "stripe") {
    return NextResponse.json({ error: "Cette commande n'est pas payable en ligne." }, { status: 400 });
  }
  if (commande.paiement_statut === "paye") {
    return NextResponse.json({ error: "Cette commande est déjà payée." }, { status: 400 });
  }

  const origine = headersList.get("origin") ?? new URL(request.url).origin;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: Math.round(commande.montant * 100),
            product_data: { name: `Commande n°${commande.numero} — 3 Sauces` },
          },
        },
      ],
      metadata: { commande_id: commande.id, numero: String(commande.numero) },
      success_url: `${origine}/commande-confirmee?canal=${commande.canal}&commande=${commande.id}&paiement=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origine}/commander?paiementAnnule=1`,
    });
  } catch (erreur) {
    console.error("[/api/commande/paiement] échec création session Stripe :", erreur);
    return NextResponse.json({ error: "Impossible de démarrer le paiement en ligne." }, { status: 500 });
  }

  const { error: erreurPaiement } = await supabase.from("paiements").insert({
    commande_id: commande.id,
    montant: commande.montant,
    mode: "stripe",
    stripe_payment_id: session.id,
  });

  if (erreurPaiement) {
    console.error("[/api/commande/paiement] échec insertion paiements :", erreurPaiement.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}
