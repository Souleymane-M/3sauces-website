import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { chargerCommandePourModification } from "@/lib/caisse/modification";

/** Charge une commande pour modification (reprend `CaisseApp` en mode édition) — même fonction que `/caisse?modifier=`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;
  const { commande, erreur } = await chargerCommandePourModification(id);
  if (!commande) {
    return NextResponse.json({ error: erreur ?? "Commande introuvable." }, { status: 400 });
  }
  return NextResponse.json({ commande });
}
