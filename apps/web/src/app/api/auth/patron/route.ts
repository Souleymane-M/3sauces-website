import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { verifySecret } from "@/lib/auth/crypto";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { estBloque, enregistrerEchec, reinitialiser } from "@/lib/auth/rate-limit";

/**
 * Connexion patron par mot de passe.
 * Body attendu : { motDePasse: string }
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  if (estBloque(`patron:${ip}`)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const motDePasse = typeof body?.motDePasse === "string" ? body.motDePasse : null;

  if (!motDePasse) {
    return NextResponse.json(
      { error: "Requête invalide : motDePasse est requis." },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: profils, error } = await supabase
    .from("profils")
    .select("id, nom, mot_de_passe_hash")
    .eq("role", "patron")
    .eq("actif", true);

  if (error) {
    return NextResponse.json(
      { error: "Erreur serveur, réessaie." },
      { status: 500 }
    );
  }

  for (const profil of profils ?? []) {
    if (
      profil.mot_de_passe_hash &&
      (await verifySecret(motDePasse, profil.mot_de_passe_hash))
    ) {
      reinitialiser(`patron:${ip}`);

      const token = await createSessionToken({
        profilId: profil.id,
        role: "patron",
        nom: profil.nom,
      });

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });

      return NextResponse.json({ ok: true, nom: profil.nom });
    }
  }

  enregistrerEchec(`patron:${ip}`);
  return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
}
