import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";

/**
 * Recherche fidélité par téléphone, pour afficher le statut (tampons,
 * récompense disponible) avant encaissement. Ne crée rien : la création du
 * client se fait automatiquement par le trigger DB au premier paiement.
 */
export async function GET(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const telephoneNormalise = normaliserTelephone(searchParams.get("telephone") ?? "");
  if (!telephoneNormalise) {
    return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("telephone, montant_cumule, tampons_acquis, recompense_disponible, date_expiration")
    .eq("telephone", telephoneNormalise)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ existe: false, telephone: telephoneNormalise });
  }

  return NextResponse.json({ existe: true, ...client });
}
