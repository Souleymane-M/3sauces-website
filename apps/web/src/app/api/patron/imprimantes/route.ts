import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerImprimantesAdmin, mettreAJourImprimante } from "@/lib/patron/imprimantes";
import type { ImprimanteAdminPatch } from "@/lib/patron/imprimantes-types";

function validerDirectPrintToken(valeur: unknown): { ok: true; directPrintToken: string | null } | { ok: false } {
  if (valeur === null || valeur === undefined || valeur === "") {
    return { ok: true, directPrintToken: null };
  }
  if (typeof valeur !== "string") {
    return { ok: false };
  }
  return { ok: true, directPrintToken: valeur.trim() };
}

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const imprimantes = await listerImprimantesAdmin();
  return NextResponse.json({ imprimantes });
}

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: string; nom?: string; directPrintToken?: string | null }
    | null;
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const patch: ImprimanteAdminPatch = {};

  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (!nom) return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    patch.nom = nom;
  }
  if (body.directPrintToken !== undefined) {
    const resultat = validerDirectPrintToken(body.directPrintToken);
    if (!resultat.ok) {
      return NextResponse.json({ error: "Jeton Server Direct Print invalide." }, { status: 400 });
    }
    patch.directPrintToken = resultat.directPrintToken;
  }

  try {
    await mettreAJourImprimante(body.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
