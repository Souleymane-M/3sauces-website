import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { declarerLivraison } from "@/lib/livreur/commandes";
import type { ModePaiement } from "@3sauces/supabase";
import type { PaiementDeclare } from "@/lib/livreur/types";

const MODES_VALIDES: ModePaiement[] = ["especes", "cb"];

export async function POST(request: Request) {
  const session = await requireRole(["livreur"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; paiements?: { mode?: string; montant?: number; payeur?: string }[] }
    | null;

  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!Array.isArray(body.paiements) || body.paiements.length === 0) {
    return NextResponse.json({ error: "Au moins un paiement est requis." }, { status: 400 });
  }

  const paiements: PaiementDeclare[] = [];
  for (const p of body.paiements) {
    if (!MODES_VALIDES.includes(p.mode as ModePaiement)) {
      return NextResponse.json({ error: "Mode de paiement invalide." }, { status: 400 });
    }
    const montant = Number(p.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      return NextResponse.json({ error: "Montant de paiement invalide." }, { status: 400 });
    }
    paiements.push({ mode: p.mode as ModePaiement, montant, payeur: p.payeur?.trim() || undefined });
  }

  try {
    await declarerLivraison({ commandeId: body.commandeId, livreurId: session.profilId, paiements });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
