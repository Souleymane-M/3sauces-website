import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerOptionsAdmin, creerOption, mettreAJourOption, supprimerOption } from "@/lib/patron/options";
import { estTypeOptionValide } from "@/lib/patron/options-types";

const UNITES_VALIDES = new Set(["grammes", "pieces"]);

export async function GET(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const type = new URL(request.url).searchParams.get("type");
  if (!type || !estTypeOptionValide(type)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }

  const options = await listerOptionsAdmin(type);
  return NextResponse.json({ options });
}

export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { type?: string; nom?: string; uniteDeduction?: string }
    | null;

  if (!body?.type || !estTypeOptionValide(body.type)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }
  const nom = (body.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }
  if (body.type === "viandes" && body.uniteDeduction !== undefined && !UNITES_VALIDES.has(body.uniteDeduction)) {
    return NextResponse.json({ error: "Unité de déduction invalide." }, { status: 400 });
  }

  try {
    await creerOption(body.type, {
      nom,
      uniteDeduction:
        body.type === "viandes" ? (body.uniteDeduction as "grammes" | "pieces" | undefined) : undefined,
    });
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
    | { type?: string; id?: string; nom?: string; actif?: boolean; uniteDeduction?: string }
    | null;

  if (!body?.type || !estTypeOptionValide(body.type)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (body.uniteDeduction !== undefined && !UNITES_VALIDES.has(body.uniteDeduction)) {
    return NextResponse.json({ error: "Unité de déduction invalide." }, { status: 400 });
  }

  const patch: { nom?: string; actif?: boolean; uniteDeduction?: "grammes" | "pieces" } = {};
  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (!nom) return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    patch.nom = nom;
  }
  if (typeof body.actif === "boolean") patch.actif = body.actif;
  if (body.uniteDeduction !== undefined) patch.uniteDeduction = body.uniteDeduction as "grammes" | "pieces";

  try {
    await mettreAJourOption(body.type, body.id, patch);
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

  const body = (await request.json().catch(() => null)) as { type?: string; id?: string } | null;
  if (!body?.type || !estTypeOptionValide(body.type)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    await supprimerOption(body.type, body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
