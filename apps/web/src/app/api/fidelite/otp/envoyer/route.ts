import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { normaliserTelephone } from "@/lib/telephone";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { envoyerCodeVerification } from "@/lib/fidelite/twilio-verify";

/**
 * Démarre la vérification OTP d'un numéro (site public, contexte fidélité
 * uniquement — jamais requis pour passer une commande). Chaque appel coûte
 * un vrai SMS Twilio : rate-limité plus sévèrement que le reste des routes
 * publiques, en plus des propres plafonds de Twilio Verify qui servent de
 * second filet.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  const body = (await request.json().catch(() => null)) as { telephone?: string } | null;
  const telephone = normaliserTelephone(body?.telephone ?? "");
  if (!telephone) {
    return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });
  }

  if (limiterDebit(`otp-envoi-tel-court:${telephone}`, 1, 60 * 1000)) {
    return NextResponse.json(
      { error: "Un code vient déjà d'être envoyé — attends une minute avant d'en redemander un." },
      { status: 429 }
    );
  }
  if (limiterDebit(`otp-envoi-tel:${telephone}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de demandes de code pour ce numéro. Réessaie plus tard." },
      { status: 429 }
    );
  }
  if (limiterDebit(`otp-envoi-ip:${ip}`, 8, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de demandes depuis cette connexion. Réessaie plus tard." },
      { status: 429 }
    );
  }

  const resultat = await envoyerCodeVerification(telephone);
  if (!resultat.ok) {
    if (resultat.motif === "numero_invalide") {
      return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });
    }
    if (resultat.motif === "trop_de_tentatives") {
      return NextResponse.json(
        { error: "Trop de tentatives sur ce numéro. Réessaie plus tard." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Impossible d'envoyer le code pour le moment. Réessaie dans quelques minutes." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, telephone });
}
