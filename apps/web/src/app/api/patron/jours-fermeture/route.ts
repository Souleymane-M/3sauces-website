import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { definirJoursFermeture } from "@/lib/patron/parametres";

export async function PATCH(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { jours?: unknown } | null;
  const brut = Array.isArray(body?.jours) ? body.jours : null;
  if (!brut || brut.some((j) => !Number.isInteger(j) || (j as number) < 0 || (j as number) > 6)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Dédoublonné et trié : la contrainte SQL refuse 7 jours fermés, on donne
  // ici un message compréhensible plutôt qu'une erreur Postgres brute.
  const jours = [...new Set(brut as number[])].sort((a, b) => a - b);
  if (jours.length === 7) {
    return NextResponse.json(
      { error: "Impossible de fermer les 7 jours : il faut au moins un jour d'ouverture." },
      { status: 400 }
    );
  }

  try {
    await definirJoursFermeture(jours);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
