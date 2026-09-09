import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerCommandesActives, changerStatutCommande } from "@/lib/cuisine/commandes";
import type { StatutEvenement } from "@/lib/cuisine/types";

// "en_attente" est l'état initial automatique, jamais une transition
// demandée par un employé — exclu volontairement des statuts acceptés ici.
const STATUTS_VALIDES: StatutEvenement[] = ["en_preparation", "pret", "remis_au_client", "pris_par_livreur", "livre"];

export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const commandes = await listerCommandesActives();
    return NextResponse.json({ commandes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; statut?: string; profilId?: string; livreurId?: string }
    | null;

  if (!body?.commandeId || typeof body.commandeId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!STATUTS_VALIDES.includes(body.statut as StatutEvenement)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }
  if (!body.profilId || typeof body.profilId !== "string") {
    return NextResponse.json({ error: "Identité employé requise." }, { status: 400 });
  }

  try {
    await changerStatutCommande({
      commandeId: body.commandeId,
      statut: body.statut as StatutEvenement,
      profilId: body.profilId,
      livreurId: body.livreurId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
