import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { verifySecret } from "@/lib/auth/crypto";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { estBloque, enregistrerEchec, reinitialiser } from "@/lib/auth/rate-limit";

/**
 * Connexion employé/livreur par code PIN.
 * Body attendu : { pin: string, role: "employe" | "livreur" }
 *
 * Comme les PIN sont hashés avec un sel différent par profil (bcrypt), on ne
 * peut pas chercher directement par hash : on récupère les profils actifs du
 * rôle demandé (une poignée par restaurant) et on compare un par un.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  if (estBloque(`pin:${ip}`)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const role = body?.role === "employe" || body?.role === "livreur" ? body.role : null;

  if (!pin || !role) {
    return NextResponse.json(
      { error: "Requête invalide : pin et role sont requis." },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: profils, error } = await supabase
    .from("profils")
    .select("id, nom, pin_hash")
    .eq("role", role)
    .eq("actif", true);

  if (error) {
    return NextResponse.json(
      { error: "Erreur serveur, réessaie." },
      { status: 500 }
    );
  }

  for (const profil of profils ?? []) {
    if (profil.pin_hash && (await verifySecret(pin, profil.pin_hash))) {
      reinitialiser(`pin:${ip}`);

      const token = await createSessionToken({
        profilId: profil.id,
        role,
        nom: profil.nom,
      });

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12, // 12h, aligné sur l'expiration du token
      });

      return NextResponse.json({ ok: true, nom: profil.nom });
    }
  }

  enregistrerEchec(`pin:${ip}`);
  return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
}
