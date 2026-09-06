import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerProduitsAdmin, creerProduit, mettreAJourProduit, supprimerProduit } from "@/lib/patron/produits";
import { CATEGORIES, type ProduitAdminInput, type ProduitAdminPatch } from "@/lib/patron/produits-types";
import type { Categorie } from "@3sauces/supabase";

const CATEGORIES_VALIDES = new Set<string>(CATEGORIES.map((c) => c.valeur));

function estCategorieValide(valeur: unknown): valeur is Categorie {
  return typeof valeur === "string" && CATEGORIES_VALIDES.has(valeur);
}

/** null/undefined -> null (prix libre) ; sinon doit être un nombre fini >= 0. */
function validerPrix(valeur: unknown): { ok: true; prix: number | null } | { ok: false } {
  if (valeur === null || valeur === undefined || valeur === "") {
    return { ok: true, prix: null };
  }
  const prix = Number(valeur);
  if (!Number.isFinite(prix) || prix < 0) {
    return { ok: false };
  }
  return { ok: true, prix };
}

function validerEntierEntre(valeur: unknown, min: number, max: number): number | null {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const produits = await listerProduitsAdmin();
  return NextResponse.json({ produits });
}

export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        nom?: string;
        categorie?: string;
        description?: string;
        prix?: number | string | null;
        nbViandesMax?: number;
        viandeImposee?: string;
        nbSaucesIncluses?: number;
        autoriseExtras?: boolean;
        nbSaveursMax?: number;
        canetteIncluse?: boolean;
      }
    | null;

  const nom = (body?.nom ?? "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }
  if (!estCategorieValide(body?.categorie)) {
    return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  }
  const resultatPrix = validerPrix(body?.prix);
  if (!resultatPrix.ok) {
    return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
  }

  const input: ProduitAdminInput = {
    nom,
    categorie: body!.categorie as Categorie,
    description: body?.description?.trim() || null,
    prix: resultatPrix.prix,
  };

  if (body?.nbViandesMax !== undefined) {
    const n = validerEntierEntre(body.nbViandesMax, 0, 4);
    if (n === null) return NextResponse.json({ error: "Nombre de viandes invalide (0 à 4)." }, { status: 400 });
    input.nbViandesMax = n;
  }
  if (body?.nbSaucesIncluses !== undefined) {
    const n = validerEntierEntre(body.nbSaucesIncluses, 0, 20);
    if (n === null) return NextResponse.json({ error: "Nombre de sauces incluses invalide." }, { status: 400 });
    input.nbSaucesIncluses = n;
  }
  if (body?.nbSaveursMax !== undefined) {
    const n = validerEntierEntre(body.nbSaveursMax, 0, 1);
    if (n === null) return NextResponse.json({ error: "Nombre de saveurs invalide (0 ou 1)." }, { status: 400 });
    input.nbSaveursMax = n;
  }
  if (body?.viandeImposee !== undefined) input.viandeImposee = body.viandeImposee.trim() || null;
  if (body?.autoriseExtras !== undefined) input.autoriseExtras = Boolean(body.autoriseExtras);
  if (body?.canetteIncluse !== undefined) input.canetteIncluse = Boolean(body.canetteIncluse);

  try {
    await creerProduit(input);
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
    | ({ id?: string } & Record<string, unknown>)
    | null;
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const patch: ProduitAdminPatch = {};

  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (!nom) return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    patch.nom = nom;
  }
  if (body.categorie !== undefined) {
    if (!estCategorieValide(body.categorie)) {
      return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
    }
    patch.categorie = body.categorie as Categorie;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.prix !== undefined) {
    const resultatPrix = validerPrix(body.prix);
    if (!resultatPrix.ok) return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
    patch.prix = resultatPrix.prix;
  }
  if (typeof body.actif === "boolean") {
    patch.actif = body.actif;
  }
  if (body.nbViandesMax !== undefined) {
    const n = validerEntierEntre(body.nbViandesMax, 0, 4);
    if (n === null) return NextResponse.json({ error: "Nombre de viandes invalide (0 à 4)." }, { status: 400 });
    patch.nbViandesMax = n;
  }
  if (body.viandeImposee !== undefined) {
    patch.viandeImposee = typeof body.viandeImposee === "string" ? body.viandeImposee.trim() || null : null;
  }
  if (body.nbSaucesIncluses !== undefined) {
    const n = validerEntierEntre(body.nbSaucesIncluses, 0, 20);
    if (n === null) return NextResponse.json({ error: "Nombre de sauces incluses invalide." }, { status: 400 });
    patch.nbSaucesIncluses = n;
  }
  if (typeof body.autoriseExtras === "boolean") {
    patch.autoriseExtras = body.autoriseExtras;
  }
  if (body.nbSaveursMax !== undefined) {
    const n = validerEntierEntre(body.nbSaveursMax, 0, 1);
    if (n === null) return NextResponse.json({ error: "Nombre de saveurs invalide (0 ou 1)." }, { status: 400 });
    patch.nbSaveursMax = n;
  }
  if (typeof body.canetteIncluse === "boolean") {
    patch.canetteIncluse = body.canetteIncluse;
  }

  try {
    await mettreAJourProduit(body.id, patch);
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
    await supprimerProduit(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
