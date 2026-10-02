import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerCommandesParClient, corrigerClientAdmin } from "@/lib/patron/clients";
import { normaliserEmail } from "@/lib/email";

/** Historique des commandes d'un client — chargé à la demande depuis la fiche sur /patron. */
export async function GET(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const telephone = new URL(request.url).searchParams.get("telephone");
  if (!telephone) {
    return NextResponse.json({ error: "Numéro de téléphone requis." }, { status: 400 });
  }

  const commandes = await listerCommandesParClient(telephone);
  return NextResponse.json({ commandes });
}

/**
 * Corrige l'identité d'un client (nom, prénom, ou numéro mal saisi) —
 * jamais les colonnes fidélité (montant_cumule, tampons...), qui restent
 * exclusivement gérées par le trigger de paiement.
 */
export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    telephone?: string;
    nouveauTelephone?: string;
    nom?: string;
    prenom?: string;
    email?: string | null;
  } | null;

  if (!body?.telephone) {
    return NextResponse.json({ error: "Numéro de téléphone requis." }, { status: 400 });
  }
  if (body.nouveauTelephone !== undefined && !body.nouveauTelephone.trim()) {
    return NextResponse.json({ error: "Le nouveau numéro ne peut pas être vide." }, { status: 400 });
  }
  if (body.nom !== undefined && !body.nom.trim()) {
    return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
  }
  if (body.prenom !== undefined && !body.prenom.trim()) {
    return NextResponse.json({ error: "Le prénom ne peut pas être vide." }, { status: 400 });
  }
  let email: string | null | undefined;
  if (body.email !== undefined) {
    if (body.email === null) {
      email = null;
    } else {
      email = normaliserEmail(body.email);
      if (!email) {
        return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
      }
    }
  }

  const { erreur } = await corrigerClientAdmin({
    telephone: body.telephone,
    nouveauTelephone: body.nouveauTelephone?.trim(),
    nom: body.nom?.trim(),
    prenom: body.prenom?.trim(),
    email,
  });

  if (erreur) {
    return NextResponse.json({ error: erreur }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
