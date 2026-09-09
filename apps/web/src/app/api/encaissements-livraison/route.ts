import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerLivraisonsAEncaisser, marquerLivraisonEncaissee, signalerEcartLivraison } from "@/lib/encaissements-livraison";

// Accessible au patron (contrôle à distance, /patron) ET au responsable de
// caisse (contrôle sur place au retour du livreur, /caisse/encaissements) —
// le patron n'a pas vocation à être présent en permanence pour valider ça.

export async function GET() {
  const session = await requireRole(["patron", "employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const livraisons = await listerLivraisonsAEncaisser();
    return NextResponse.json({ livraisons });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireRole(["patron", "employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeId?: string; action?: "valider" | "signaler_ecart"; note?: string }
    | null;
  if (!body?.commandeId) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const action = body.action ?? "valider";

  try {
    if (action === "signaler_ecart") {
      const note = (body.note ?? "").trim();
      if (!note) {
        return NextResponse.json({ error: "Décris l'écart constaté." }, { status: 400 });
      }
      await signalerEcartLivraison(body.commandeId, note, session.profilId);
    } else {
      await marquerLivraisonEncaissee(body.commandeId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
