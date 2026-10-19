import { NextResponse } from "next/server";
import type { RoleMetier } from "@3sauces/supabase";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { definirActif, reinitialiserPin, definirRolesMetier } from "@/lib/patron/utilisateurs";

const ROLES_METIER_VALIDES: RoleMetier[] = ["cuisine", "comptoir", "livreur", "patron"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoleMetier(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | { actif?: boolean; pin?: string; rolesMetier?: string[] }
    | null;

  try {
    if (typeof body?.actif === "boolean") {
      await definirActif(id, body.actif);
    }
    if (typeof body?.pin === "string") {
      if (!/^\d{4,6}$/.test(body.pin)) {
        return NextResponse.json({ error: "PIN invalide (4 à 6 chiffres)." }, { status: 400 });
      }
      await reinitialiserPin(id, body.pin);
    }
    if (Array.isArray(body?.rolesMetier)) {
      const roles = body.rolesMetier.filter((r): r is RoleMetier => ROLES_METIER_VALIDES.includes(r as RoleMetier));
      await definirRolesMetier(id, roles);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
