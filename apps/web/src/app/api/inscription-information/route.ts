import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { normaliserEmail } from "@/lib/email";
import { TEXTE_CONSENTEMENT_V1 } from "@/lib/inscription-information";

const MAX_INSCRIPTIONS_PAR_FENETRE = 5;
const FENETRE_MS = 10 * 60 * 1000;

/**
 * Inscription publique aux informations de réouverture (et, si la case est cochée, aux offres).
 * Réponse toujours identique que l'email soit nouveau ou déjà connu : on ne révèle jamais si une
 * adresse est déjà inscrite. Une nouvelle inscription après une désinscription est un nouvel
 * acte volontaire de la personne : elle réactive son inscription.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";
  if (limiterDebit(`inscription-info:${ip}`, MAX_INSCRIPTIONS_PAR_FENETRE, FENETRE_MS)) {
    return NextResponse.json({ error: "Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown; accepteOffres?: unknown; siteWeb?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  // Champ piège invisible pour les humains : rempli = robot. Réponse « ok » sans rien enregistrer.
  if (typeof body.siteWeb === "string" && body.siteWeb.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = typeof body.email === "string" && body.email.length <= 254 ? normaliserEmail(body.email) : null;
  if (!email) {
    return NextResponse.json({ error: "Indiquez une adresse email valide." }, { status: 400 });
  }
  const accepteOffres = body.accepteOffres === true;

  const supabase = createServiceSupabaseClient();
  const { data: existant, error: erreurLecture } = await supabase
    .from("inscriptions_information")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (erreurLecture) {
    return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  }

  const maintenant = new Date().toISOString();
  if (existant) {
    const { error } = await supabase
      .from("inscriptions_information")
      .update({ accepte_offres: accepteOffres, consentement_le: maintenant, texte_consentement: TEXTE_CONSENTEMENT_V1, desinscrit_le: null })
      .eq("id", existant.id);
    if (error) return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("inscriptions_information")
      .insert({ email, accepte_offres: accepteOffres, consentement_le: maintenant, texte_consentement: TEXTE_CONSENTEMENT_V1 });
    if (error) return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
