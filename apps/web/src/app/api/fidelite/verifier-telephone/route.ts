import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { limiterDebit } from "@/lib/auth/rate-limit";
import { verifierTelephoneParQrLivraison } from "@/lib/fidelite/activation";

/**
 * Vérifie que le téléphone saisi correspond à celui de la commande — cf.
 * `verifierTelephoneParQrLivraison`. Limité par code ET par IP : un numéro
 * mayottais tient sur peu de chiffres, jamais assez d'essais pour le
 * deviner.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  const body = (await request.json().catch(() => null)) as { code?: string; telephone?: string } | null;
  const code = typeof body?.code === "string" ? body.code : null;
  const telephone = typeof body?.telephone === "string" ? body.telephone : null;
  if (!code || !telephone) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (limiterDebit(`fidelite-verif:${code}`, 6, 15 * 60 * 1000) || limiterDebit(`fidelite-verif-ip:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  const activation = await verifierTelephoneParQrLivraison(code, telephone);
  if (!activation) {
    return NextResponse.json({ error: "Numéro incorrect." }, { status: 404 });
  }
  return NextResponse.json(activation);
}
