import { NextResponse } from "next/server";
import type { ModePaiement } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import {
  listerLivraisonsAEncaisser,
  marquerLivraisonEncaissee,
  declarerEtValiderManuellement,
  signalerEcartLivraison,
} from "@/lib/encaissements-livraison";

const MODES_VALIDES: ModePaiement[] = ["especes", "cb"];

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
    | {
        commandeId?: string;
        action?: "valider" | "signaler_ecart" | "declarer_et_valider";
        note?: string;
        paiements?: { mode?: string; montant?: number; payeur?: string }[];
      }
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
    } else if (action === "declarer_et_valider") {
      if (!Array.isArray(body.paiements) || body.paiements.length === 0) {
        return NextResponse.json({ error: "Au moins un paiement est requis." }, { status: 400 });
      }
      const paiements = [];
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
      await declarerEtValiderManuellement(body.commandeId, paiements, session.profilId);
    } else {
      await marquerLivraisonEncaissee(body.commandeId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
