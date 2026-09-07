import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerImprimantesAdmin, mettreAJourImprimante } from "@/lib/patron/imprimantes";
import type { ImprimanteAdminPatch } from "@/lib/patron/imprimantes-types";

// Regex volontairement simple (IPv4 uniquement) : les imprimantes du resto
// sont sur un réseau local classique, pas besoin d'IPv6/nom d'hôte pour
// l'instant.
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function validerAdresseIp(valeur: unknown): { ok: true; adresseIp: string | null } | { ok: false } {
  if (valeur === null || valeur === undefined || valeur === "") {
    return { ok: true, adresseIp: null };
  }
  if (typeof valeur !== "string" || !IPV4_REGEX.test(valeur.trim())) {
    return { ok: false };
  }
  return { ok: true, adresseIp: valeur.trim() };
}

function validerPort(valeur: unknown): number | null {
  const port = Number(valeur);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
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
    | { id?: string; nom?: string; adresseIp?: string | null; port?: number | string }
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
  if (body.adresseIp !== undefined) {
    const resultat = validerAdresseIp(body.adresseIp);
    if (!resultat.ok) {
      return NextResponse.json({ error: "Adresse IP invalide (ex: 192.168.1.50)." }, { status: 400 });
    }
    patch.adresseIp = resultat.adresseIp;
  }
  if (body.port !== undefined) {
    const port = validerPort(body.port);
    if (port === null) return NextResponse.json({ error: "Port invalide (1 à 65535)." }, { status: 400 });
    patch.port = port;
  }

  try {
    await mettreAJourImprimante(body.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
