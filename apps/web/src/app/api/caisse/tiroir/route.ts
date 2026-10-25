import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { chargerEtatTiroir, enregistrerCloture, enregistrerOuverture, enregistrerSortie } from "@/lib/caisse/tiroir";

// Les employés ne voient jamais le montant attendu avant d'avoir validé leur
// comptage (comptage à l'aveugle) : seule la réponse de la clôture le porte.
export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  try {
    return NextResponse.json({ etat: await chargerEtatTiroir() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    detail?: unknown;
    montant?: unknown;
    motif?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  try {
    if (body.action === "ouverture") {
      const r = await enregistrerOuverture(session.profilId, body.detail);
      if (!r.ok) return NextResponse.json({ error: r.erreur }, { status: r.statut });
      return NextResponse.json({ etat: await chargerEtatTiroir() });
    }
    if (body.action === "sortie") {
      const r = await enregistrerSortie(session.profilId, body.montant, body.motif);
      if (!r.ok) return NextResponse.json({ error: r.erreur }, { status: r.statut });
      return NextResponse.json({ etat: await chargerEtatTiroir() });
    }
    if (body.action === "cloture") {
      const r = await enregistrerCloture(session.profilId, body.detail);
      if (!r.ok) return NextResponse.json({ error: r.erreur }, { status: r.statut });
      return NextResponse.json({ etat: await chargerEtatTiroir(), bilan: r.bilan, compte: r.compte });
    }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue." }, { status: 500 });
  }
}
