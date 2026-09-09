import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { verifySecret } from "@/lib/auth/crypto";
import { estBloque, enregistrerEchec, reinitialiser } from "@/lib/auth/rate-limit";

/**
 * Identification légère "qui agit en ce moment" sur l'iPad partagé de
 * /commandes — distincte de la connexion PIN de la page elle-même
 * (`requireRole(["employe"])`, cookie 12h partagé par tout le monde sur
 * l'appareil). Ne pose pas de cookie : le résultat vit uniquement côté
 * client (sessionStorage), avec un minuteur d'inactivité de 10 minutes —
 * cf. components/cuisine/commandes-app.tsx. Même logique de comparaison
 * PIN une par une que /api/auth/pin, réservée au rôle "employe" (jamais
 * patron/livreur ici).
 */
export async function POST(request: Request) {
  const session = await requireRole(["employe"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  if (estBloque(`cuisine-identifier:${ip}`)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  if (!pin) {
    return NextResponse.json({ error: "Code PIN requis." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profils, error } = await supabase
    .from("profils")
    .select("id, nom, pin_hash")
    .eq("role", "employe")
    .eq("actif", true);

  if (error) {
    return NextResponse.json({ error: "Erreur serveur, réessaie." }, { status: 500 });
  }

  for (const profil of profils ?? []) {
    if (profil.pin_hash && (await verifySecret(pin, profil.pin_hash))) {
      reinitialiser(`cuisine-identifier:${ip}`);
      return NextResponse.json({ profilId: profil.id, nom: profil.nom });
    }
  }

  enregistrerEchec(`cuisine-identifier:${ip}`);
  return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
}
