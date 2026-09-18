import { NextResponse } from "next/server";
import { normaliserTelephone } from "@/lib/telephone";
import { estBloque, enregistrerEchec, reinitialiser } from "@/lib/auth/rate-limit";
import { verifierCodeVerification } from "@/lib/fidelite/twilio-verify";
import { creerTokenFidelite } from "@/lib/fidelite/session";

const DUREE_TOKEN_JOURS = 30;

/**
 * Vérifie le code OTP saisi et délivre le jeton de session fidélité
 * (30 jours, stocké côté client en localStorage). Message d'erreur
 * volontairement vague ("code incorrect ou expiré") — jamais de distinction
 * entre code faux / expiré / numéro inconnu, pour ne rien révéler à un
 * attaquant qui tenterait de deviner le code d'un tiers.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { telephone?: string; code?: string } | null;
  const telephone = normaliserTelephone(body?.telephone ?? "");
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!telephone || !/^\d{4,6}$/.test(code)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const cle = `otp-verif:${telephone}`;
  if (estBloque(cle)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Redemande un code plus tard." },
      { status: 429 }
    );
  }

  const resultat = await verifierCodeVerification(telephone, code);
  if (!resultat.ok) {
    enregistrerEchec(cle);
    return NextResponse.json(
      { error: "Code incorrect ou expiré. Redemande un code si besoin." },
      { status: 400 }
    );
  }

  reinitialiser(cle);
  const token = await creerTokenFidelite(telephone);
  const expireLe = new Date(Date.now() + DUREE_TOKEN_JOURS * 24 * 60 * 60 * 1000).toISOString();

  return NextResponse.json({ ok: true, token, telephone, expireLe });
}
