import { NextResponse } from "next/server";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { lierEmailAuTelephone } from "@/lib/fidelite/liaison";

/** Associe un email à un numéro qui n'en a pas encore (cf. `/api/fidelite/solde`, raison "email_manquant"). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { telephone?: string; email?: string } | null;
  const telephone = normaliserTelephone(body?.telephone ?? "");
  const email = normaliserEmail(body?.email ?? "");
  if (!telephone || !email) {
    return NextResponse.json({ error: "Numéro de téléphone ou email invalide." }, { status: 400 });
  }

  if (limiterDebit(`fidelite-lier:${telephone}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  try {
    const solde = await lierEmailAuTelephone(telephone, email);
    return NextResponse.json(solde);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
