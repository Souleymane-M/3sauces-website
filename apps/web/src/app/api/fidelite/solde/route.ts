import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { lireTokenFideliteDepuisHeader } from "@/lib/fidelite/session";
import { limiterDebit } from "@/lib/auth/rate-limit";

/**
 * Solde fidélité du titulaire du jeton (jamais d'un téléphone pris en
 * paramètre de requête — sinon le jeton ne protège plus rien). Un client
 * jamais vu en base est un état légitime (nouveau client), pas une erreur.
 */
export async function GET(request: Request) {
  const telephone = await lireTokenFideliteDepuisHeader(request);
  if (!telephone) {
    return NextResponse.json(
      { error: "Session fidélité expirée, revérifie ton numéro." },
      { status: 401 }
    );
  }

  if (limiterDebit(`fidelite-solde:${telephone}`, 30, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes, réessaie plus tard." }, { status: 429 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("montant_cumule, tampons_acquis, recompense_disponible, date_expiration")
    .eq("telephone", telephone)
    .maybeSingle();

  if (error) {
    console.error("[/api/fidelite/solde] échec lecture client :", error.message);
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  return NextResponse.json({
    telephone,
    montantCumule: data?.montant_cumule ?? 0,
    tamponsAcquis: data?.tampons_acquis ?? 0,
    recompenseDisponible: data?.recompense_disponible ?? false,
    dateExpiration: data?.date_expiration ?? null,
  });
}
