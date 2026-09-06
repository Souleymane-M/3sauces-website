import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import {
  listerPlatsDuJourAdmin,
  creerPlatDuJour,
  mettreAJourPlatDuJour,
  supprimerPlatDuJour,
} from "@/lib/patron/plats-du-jour";

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const plats = await listerPlatsDuJourAdmin();
  return NextResponse.json({ plats });
}

export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { nom?: string; description?: string; prix?: number }
    | null;

  const nom = (body?.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }

  const prix = Number(body?.prix);
  if (!Number.isFinite(prix) || prix < 0) {
    return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
  }

  try {
    await creerPlatDuJour({ nom, description: body?.description?.trim() || null, prix });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: string; nom?: string; description?: string | null; prix?: number; actif?: boolean }
    | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input: { nom?: string; description?: string | null; prix?: number; actif?: boolean } = {};

  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (!nom) {
      return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    }
    input.nom = nom;
  }
  if (body.description !== undefined) {
    input.description = body.description?.trim() || null;
  }
  if (body.prix !== undefined) {
    const prix = Number(body.prix);
    if (!Number.isFinite(prix) || prix < 0) {
      return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
    }
    input.prix = prix;
  }
  if (typeof body.actif === "boolean") {
    input.actif = body.actif;
  }

  try {
    await mettreAJourPlatDuJour(body.id, input);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await supprimerPlatDuJour(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
