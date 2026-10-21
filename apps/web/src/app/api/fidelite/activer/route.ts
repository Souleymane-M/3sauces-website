import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { normaliserEmail } from "@/lib/email";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { activerEmailParQrLivraison } from "@/lib/fidelite/activation";

/** Enregistre l'email du client sur la page "voir mes tampons" post-livraison, cf. `activerEmailParQrLivraison`. */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";
  if (limiterDebit(`fidelite-activer:${ip}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { code?: string; email?: string } | null;
  const code = typeof body?.code === "string" ? body.code : null;
  const email = normaliserEmail(body?.email ?? "");
  if (!code || !email) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  try {
    const activation = await activerEmailParQrLivraison(code, email);
    return NextResponse.json(activation);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
