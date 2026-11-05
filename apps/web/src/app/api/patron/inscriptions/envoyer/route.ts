import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerDestinataires, type CibleEnvoi } from "@/lib/patron/inscriptions";
import { envoyerEmail } from "@/lib/notifications/email";
import { construireEmailClientHtml } from "@/lib/notifications/template";
import { normaliserEmail } from "@/lib/email";

const TAILLE_LOT = 20;
const SUJET_MAX = 150;
const MESSAGE_MAX = 3000;

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function construireHtml(message: string, cible: CibleEnvoi, jeton: string): string {
  const corps = echapper(message).replace(/\n/g, "<br>");
  const motif =
    cible === "offres"
      ? "Vous recevez cet email car vous avez accepté de recevoir les offres et actualités de 3 Sauces."
      : "Vous recevez cet email car vous avez demandé à être prévenu(e) de la réouverture de 3 Sauces sur 3sauces.fr.";
  const lien = `https://3sauces.fr/desinscription?jeton=${jeton}`;
  return construireEmailClientHtml(
    `<p>${corps}</p><p style="margin-top:24px;font-size:12px;color:#777777;">${motif}<br><a href="${lien}" style="color:#8B2020;">Me désinscrire</a></p>`,
    "Commander"
  );
}

/**
 * Envoi par lots (patron uniquement, déclenché à la main — jamais automatique). L'écran appelle cette route
 * plusieurs fois (`debut` = position dans la liste) pour rester sous la limite de durée du serveur.
 * Avec `test` : un seul email de test à l'adresse donnée, sans toucher aux inscrits.
 */
export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    cible?: unknown;
    sujet?: unknown;
    message?: unknown;
    test?: unknown;
    debut?: unknown;
  } | null;
  const cible: CibleEnvoi | null = body?.cible === "reouverture" || body?.cible === "offres" ? body.cible : null;
  const sujet = typeof body?.sujet === "string" ? body.sujet.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!cible || !sujet || !message || sujet.length > SUJET_MAX || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "Choisis la cible, un sujet et un message (limites de longueur respectées)." }, { status: 400 });
  }

  if (typeof body?.test === "string" && body.test.trim()) {
    const adresse = normaliserEmail(body.test);
    if (!adresse) return NextResponse.json({ error: "Adresse de test invalide." }, { status: 400 });
    const r = await envoyerEmail(adresse, `[TEST] ${sujet}`, construireHtml(message, cible, "00000000-0000-0000-0000-000000000000"));
    return r.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: r.erreur ?? "Envoi impossible." }, { status: 502 });
  }

  const debut = typeof body?.debut === "number" && Number.isInteger(body.debut) && body.debut >= 0 ? body.debut : 0;
  const destinataires = await listerDestinataires(cible);
  const lot = destinataires.slice(debut, debut + TAILLE_LOT);

  let envoyes = 0;
  const echecs: string[] = [];
  for (const d of lot) {
    const r = await envoyerEmail(d.email, sujet, construireHtml(message, cible, d.jeton));
    if (r.ok) envoyes++;
    else echecs.push(d.email);
  }
  const suivant = debut + lot.length < destinataires.length ? debut + lot.length : null;
  return NextResponse.json({ ok: true, total: destinataires.length, envoyes, echecs, suivant });
}
