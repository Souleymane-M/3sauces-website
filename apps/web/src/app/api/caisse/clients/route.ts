import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";
import { compterTamponsDisponibles } from "@/lib/fidelite/tampons";

/**
 * Recherche fidélité par téléphone, pour afficher le statut (tampons
 * disponibles) avant encaissement. Ne crée rien : la création du client se
 * fait automatiquement par le trigger DB au premier paiement.
 */
export async function GET(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const telephoneNormalise = normaliserTelephone(searchParams.get("telephone") ?? "");
  if (!telephoneNormalise) {
    return NextResponse.json({ error: "Numéro de téléphone invalide — vérifie que tu l'as bien saisi (ex: 0639123456)." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("telephone, nom, prenom, email")
    .eq("telephone", telephoneNormalise)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ existe: false, telephone: telephoneNormalise });
  }

  const tampons = await compterTamponsDisponibles(supabase, telephoneNormalise);

  return NextResponse.json({
    existe: true,
    ...client,
    tamponsDisponibles: tampons.nombre,
    prochaineExpiration: tampons.prochaineExpiration,
  });
}
