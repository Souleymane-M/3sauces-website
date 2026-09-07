import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";

/**
 * Lecture seule pour /caisse : la config réseau des imprimantes reste
 * modifiable uniquement depuis /patron (cf. /api/patron/imprimantes), mais
 * la caisse a besoin de connaître l'adresse IP/port à jour pour imprimer —
 * appelée juste avant chaque impression (pas seulement au chargement de la
 * page) pour qu'un changement d'IP en plein service prenne effet sans
 * recharger l'onglet.
 */
export async function GET() {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const imprimantes = await listerImprimantesAdmin();
  return NextResponse.json({ imprimantes });
}
