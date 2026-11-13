import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { jetonDesinscription, listerClientsRelance, personnaliserMessage, phraseFidelite, type ModeRelance } from "@/lib/patron/relance";
import { envoyerEmail } from "@/lib/notifications/email";
import { construireEmailClientHtml } from "@/lib/notifications/template";
import { normaliserEmail } from "@/lib/email";
import { normaliserSourceCampagne } from "@/lib/campagne";
import { createServiceSupabaseClient } from "@3sauces/supabase";

const TAILLE_LOT = 20;
const SUJET_MAX = 150;
const MESSAGE_MAX = 3000;

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function lireMode(valeur: unknown): ModeRelance | null {
  return valeur === "relance" || valeur === "recompense" || valeur === "points" ? valeur : null;
}

function lireJours(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 14;
}

function construireHtml(message: string, jeton: string, campagne: string | null): string {
  const corps = echapper(message).replace(/\n/g, "<br>");
  const lien = `https://3sauces.fr/desinscription?jeton=${jeton}`;
  return construireEmailClientHtml(
    `<p>${corps}</p><p style="margin-top:24px;font-size:12px;color:#777777;">Vous recevez cet email car vous avez déjà commandé chez 3 Sauces et disposez d'un compte fidélité.<br><a href="${lien}" style="color:#8B2020;">Me désinscrire</a></p>`,
    "Commander",
    campagne ? `https://3sauces.fr/?src=email-${campagne}` : undefined
  );
}

/** Liste des clients concernés (aperçu avant envoi). */
export async function GET(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("stats") === "1") {
    const supabase = createServiceSupabaseClient();
    const depuis = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("commandes")
      .select("source_campagne, montant")
      .not("source_campagne", "is", null)
      .neq("statut", "annulee")
      .gte("created_at", depuis);
    if (error) {
      return NextResponse.json({ error: "Suivi indisponible : la migration « source_campagne » n'est pas encore passée dans Supabase." }, { status: 500 });
    }
    const parSource = new Map<string, { commandes: number; ca: number }>();
    for (const c of data ?? []) {
      const s = c.source_campagne ?? "";
      const x = parSource.get(s) ?? { commandes: 0, ca: 0 };
      x.commandes += 1;
      x.ca += Number(c.montant);
      parSource.set(s, x);
    }
    return NextResponse.json({ sources: [...parSource].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.commandes - a.commandes) });
  }
  const mode = lireMode(url.searchParams.get("mode"));
  if (!mode) return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  try {
    const clients = await listerClientsRelance(mode, lireJours(url.searchParams.get("jours")));
    return NextResponse.json({
      clients: clients.map((c) => ({ ...c, phrase: phraseFidelite(c) })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Chargement impossible." }, { status: 500 });
  }
}

/**
 * Envoi par lots (patron uniquement, jamais automatique). Même principe que l'envoi des inscrits : l'écran rappelle
 * cette route (`debut`) pour rester sous la limite de durée du serveur. Avec `test` : un seul email, sans toucher aux clients.
 */
export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    jours?: unknown;
    sujet?: unknown;
    message?: unknown;
    test?: unknown;
    debut?: unknown;
    campagne?: unknown;
  } | null;
  const mode = lireMode(body?.mode);
  const sujet = typeof body?.sujet === "string" ? body.sujet.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!mode || !sujet || !message || sujet.length > SUJET_MAX || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "Choisis le mode, un sujet et un message (limites de longueur respectées)." }, { status: 400 });
  }

  const campagne = normaliserSourceCampagne(body?.campagne);

  if (typeof body?.test === "string" && body.test.trim()) {
    const adresse = normaliserEmail(body.test);
    if (!adresse) return NextResponse.json({ error: "Adresse de test invalide." }, { status: 400 });
    const exemple = personnaliserMessage(message, {
      telephone: "",
      email: adresse,
      prenom: "Prénom",
      nbCommandes: 3,
      derniereCommande: null,
      joursDepuis: null,
      recompenses: mode === "recompense" ? 1 : 0,
      prochaineExpiration: mode === "recompense" ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
      tampons: 6,
    });
    const r = await envoyerEmail(adresse, `[TEST] ${sujet}`, construireHtml(exemple, "00000000-0000-0000-0000-000000000000", campagne));
    return r.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: r.erreur ?? "Envoi impossible." }, { status: 502 });
  }

  const debut = typeof body?.debut === "number" && Number.isInteger(body.debut) && body.debut >= 0 ? body.debut : 0;
  let destinataires;
  try {
    destinataires = await listerClientsRelance(mode, lireJours(body?.jours));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Chargement impossible." }, { status: 500 });
  }
  const lot = destinataires.slice(debut, debut + TAILLE_LOT);

  let envoyes = 0;
  const echecs: string[] = [];
  for (const c of lot) {
    try {
      const jeton = await jetonDesinscription(c.email);
      if (!jeton) continue;
      const r = await envoyerEmail(c.email, sujet, construireHtml(personnaliserMessage(message, c), jeton, campagne));
      if (r.ok) envoyes++;
      else echecs.push(c.email);
    } catch {
      echecs.push(c.email);
    }
  }
  const suivant = debut + lot.length < destinataires.length ? debut + lot.length : null;
  return NextResponse.json({ ok: true, total: destinataires.length, envoyes, echecs, suivant });
}
