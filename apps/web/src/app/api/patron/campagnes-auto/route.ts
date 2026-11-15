import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/get-session";
import { enregistrerCampagneAuto, listerCampagnesAuto, toutDesactiver, type EntreeCampagne } from "@/lib/patron/campagnes-auto";

export async function GET() {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  try {
    return NextResponse.json({ campagnes: await listerCampagnesAuto() });
  } catch {
    return NextResponse.json({ error: "Campagnes indisponibles : la migration « campagnes_auto » n'est pas encore passée dans Supabase." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as (Partial<EntreeCampagne> & { toutDesactiver?: boolean }) | null;
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  if (body.toutDesactiver) {
    const erreur = await toutDesactiver();
    return erreur ? NextResponse.json({ error: erreur }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  const erreur = await enregistrerCampagneAuto({
    jourSemaine: Number(body.jourSemaine),
    actif: body.actif === true,
    mode: body.mode as EntreeCampagne["mode"],
    joursInactivite: Number(body.joursInactivite ?? 14),
    sujet: typeof body.sujet === "string" ? body.sujet : "",
    message: typeof body.message === "string" ? body.message : "",
    etiquette: typeof body.etiquette === "string" ? body.etiquette : "",
  });
  return erreur ? NextResponse.json({ error: erreur }, { status: 400 }) : NextResponse.json({ ok: true });
}
