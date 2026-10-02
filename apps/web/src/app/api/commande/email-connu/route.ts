import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { normaliserTelephone } from "@/lib/telephone";
import { limiterDebit } from "@/lib/auth/rate-limit";

const MAX_APPELS_PAR_FENETRE = 30;
const FENETRE_RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Un numéro déjà client n'a pas à retaper son email à chaque commande.
 * Ne renvoie JAMAIS l'email lui-même (juste oui/non) — un numéro de
 * téléphone est trop facile à deviner/essayer en boucle pour qu'on prenne
 * le risque d'exposer une adresse email réelle à qui que ce soit d'autre
 * que son propriétaire.
 */
export async function GET(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";
  if (limiterDebit(`email-connu:${ip}`, MAX_APPELS_PAR_FENETRE, FENETRE_RATE_LIMIT_MS)) {
    return NextResponse.json({ error: "Trop de requêtes, réessaie dans quelques minutes." }, { status: 429 });
  }

  const telephone = normaliserTelephone(new URL(request.url).searchParams.get("telephone") ?? "");
  if (!telephone) {
    return NextResponse.json({ emailConnu: false });
  }

  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("clients").select("email").eq("telephone", telephone).maybeSingle();

  return NextResponse.json({ emailConnu: Boolean(data?.email) });
}
