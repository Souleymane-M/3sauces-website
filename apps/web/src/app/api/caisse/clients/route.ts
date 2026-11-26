import { lireProfilEnregistre } from "@/lib/profil-client-serveur";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { normaliserTelephone } from "@/lib/telephone";
import { resoudreTelephoneClient } from "@/lib/telephone-client";
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
  const telephoneSaisi = normaliserTelephone(searchParams.get("telephone") ?? "");
  if (!telephoneSaisi) {
    return NextResponse.json({ error: "Numéro de téléphone invalide — vérifie que tu l'as bien saisi (ex: 0639123456)." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  // Même numéro écrit en +262 ou en +33 : on retrouve la fiche existante.
  const telephoneNormalise = await resoudreTelephoneClient(supabase, telephoneSaisi);
  const { data: client, error } = await supabase
    .from("clients")
    .select("telephone, nom, prenom, email, email_confirme_le, montant_cumule")
    .eq("telephone", telephoneNormalise)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ existe: false, telephone: telephoneNormalise });
  }

  const tampons = await compterTamponsDisponibles(supabase, telephoneNormalise);

  const profil = await lireProfilEnregistre(supabase, telephoneNormalise);

  // Compte non activé (email absent ou jamais confirmé) : la récompense existe mais reste verrouillée, jamais proposée en caisse.
  const emailConfirme = !!client.email && !!client.email_confirme_le;
  const { email_confirme_le: _confirmeLe, ...clientSansConfirmation } = client;
  void _confirmeLe;

  return NextResponse.json({
    existe: true,
    ...clientSansConfirmation,
    emailConfirme,
    tamponsBloques: emailConfirme ? 0 : tampons.nombre,
    profil,
    montantCumule: client.montant_cumule,
    tamponsDisponibles: emailConfirme ? tampons.nombre : 0,
    prochaineExpiration: tampons.prochaineExpiration,
  });
}
