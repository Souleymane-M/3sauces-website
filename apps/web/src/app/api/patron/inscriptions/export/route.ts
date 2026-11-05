import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { listerInscriptions } from "@/lib/patron/inscriptions";

const jourMayotte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/** Export CSV (séparateur « ; », ouvre directement dans Excel) — patron uniquement. */
export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const inscriptions = await listerInscriptions();
  const lignes = [
    "email;recoit_les_offres;inscrit_le;statut",
    ...inscriptions.map((i) =>
      [i.email, i.accepteOffres ? "oui" : "non", jourMayotte(i.consentementLe), i.desinscritLe ? "désinscrit" : "actif"].join(";")
    ),
  ];
  return new NextResponse("﻿" + lignes.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inscrits-3sauces.csv"',
    },
  });
}
