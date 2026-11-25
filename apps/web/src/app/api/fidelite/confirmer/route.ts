import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { confirmerEmailParJeton } from "@/lib/fidelite/email-confirme";

/** Valide le lien de confirmation d'email reçu par le client (bouton de la page `/fidelite/confirmer`). */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";
  if (limiterDebit(`fidelite-confirmer:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { jeton?: string } | null;
  const resultat = await confirmerEmailParJeton(typeof body?.jeton === "string" ? body.jeton : "");
  return NextResponse.json({ resultat }, { status: resultat === "ok" || resultat === "deja_active" ? 200 : 400 });
}
