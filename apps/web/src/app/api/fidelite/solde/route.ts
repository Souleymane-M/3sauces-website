import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";
import { limiterDebit } from "@/lib/auth/rate-limit";

/**
 * Solde fidélité par téléphone + email — remplace l'ancienne vérification
 * par code SMS (abandonnée le 2026-10-05 : trop de clientes ne recevaient
 * jamais le SMS). Les deux doivent correspondre à la même fiche client :
 * moins robuste qu'un vrai code à usage unique, mais suffisant pour un
 * simple affichage de solde (aucun montant en jeu ici) — demandé
 * explicitement par le patron pour ne plus dépendre d'un envoi externe.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { telephone?: string; email?: string } | null;
  if (!body) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const telephone = normaliserTelephone(body.telephone ?? "");
  const email = normaliserEmail(body.email ?? "");
  if (!telephone || !email) {
    return NextResponse.json({ error: "Numéro de téléphone ou email invalide." }, { status: 400 });
  }

  if (limiterDebit(`fidelite-solde:${telephone}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("email, montant_cumule, tampons_acquis, recompense_disponible, date_expiration")
    .eq("telephone", telephone)
    .maybeSingle();

  if (error) {
    console.error("[/api/fidelite/solde] échec lecture client :", error.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  // Même message générique que le numéro soit inconnu ou que l'email ne
  // corresponde pas — jamais révéler laquelle des deux infos est fausse.
  if (!data || !data.email || data.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "Numéro de téléphone ou email incorrect." }, { status: 404 });
  }

  return NextResponse.json({
    telephone,
    montantCumule: data.montant_cumule,
    tamponsAcquis: data.tampons_acquis,
    recompenseDisponible: data.recompense_disponible,
    dateExpiration: data.date_expiration,
  });
}
