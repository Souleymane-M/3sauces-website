import { NextResponse } from "next/server";
import type { RoleMetier } from "@3sauces/supabase";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { listerUtilisateurs, creerUtilisateur } from "@/lib/patron/utilisateurs";

const ROLES_METIER_VALIDES: RoleMetier[] = ["cuisine", "comptoir", "livreur", "patron", "produits"];

export async function GET() {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  try {
    const utilisateurs = await listerUtilisateurs();
    return NextResponse.json({ utilisateurs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { nom?: string; role?: string; pin?: string; rolesMetier?: string[] }
    | null;

  const nom = body?.nom?.trim();
  const role = body?.role === "employe" || body?.role === "livreur" ? body.role : null;
  const pin = body?.pin;
  const rolesMetier = (body?.rolesMetier ?? []).filter((r): r is RoleMetier =>
    ROLES_METIER_VALIDES.includes(r as RoleMetier)
  );

  if (!nom || !role || !pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: "Requête invalide : nom, role et PIN (4 à 6 chiffres) requis." }, { status: 400 });
  }
  if (role === "employe" && rolesMetier.length === 0) {
    return NextResponse.json({ error: "Choisis au moins un rôle (cuisine et/ou comptoir)." }, { status: 400 });
  }

  try {
    const id = await creerUtilisateur({ nom, role, pin, rolesMetier });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
