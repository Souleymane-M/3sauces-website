import { NextResponse } from "next/server";
import { executerCampagneDuJour } from "@/lib/patron/campagnes-auto";

/** Marge de temps pour envoyer à tous les clients (un e-mail à la fois). */
export const maxDuration = 300;

/**
 * Déclenché par le planificateur de Vercel (cf. vercel.json) les lundi, mercredi et vendredi matin. Vercel envoie
 * `Authorization: Bearer <CRON_SECRET>` ; sans ce secret configuré, la route refuse tout appel.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    return NextResponse.json(await executerCampagneDuJour());
  } catch (e) {
    console.error("[cron/campagnes] échec :", e);
    return NextResponse.json({ error: "Échec de l'exécution." }, { status: 500 });
  }
}
