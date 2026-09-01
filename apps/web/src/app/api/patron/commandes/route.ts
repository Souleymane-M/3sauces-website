import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import {
  STATUTS_COMMANDE_PUBLIQUE,
  listerCommandesAdmin,
  mettreAJourStatutCommande,
} from "@/lib/commande-publique/admin";
import type { StatutCommandePublique } from "@/lib/commande-publique/types";

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const commandes = await listerCommandesAdmin();
  return NextResponse.json({ commandes });
}

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string; statut?: string } | null;
  if (!body?.id || !body.statut) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!STATUTS_COMMANDE_PUBLIQUE.includes(body.statut as StatutCommandePublique)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  try {
    await mettreAJourStatutCommande(body.id, body.statut as StatutCommandePublique);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
