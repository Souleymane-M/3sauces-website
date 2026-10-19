import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { verifySecret } from "@/lib/auth/crypto";
import { getSession } from "@/lib/auth/get-session";
import { estBloqueDb, enregistrerEchecDb, reinitialiserDb } from "@/lib/auth/rate-limit-db";
import { chargerSeuil } from "@/lib/patron/seuils";

const FENETRE_MS = 5 * 60 * 1000;

/**
 * Re-confirmation du PIN pour une action sensible (annulation, clôture
 * manuelle, encaissement) même si la session appareil est active — demande
 * explicite du patron, 2026-10-19. Ne vérifie QUE le PIN de la personne
 * déjà connectée (via le cookie de session), jamais une recherche parmi
 * tous les profils : plus précis qu'une connexion complète, et empêche
 * quelqu'un d'autre de confirmer à la place de la personne attribuée.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  if (!pin) {
    return NextResponse.json({ error: "PIN requis." }, { status: 400 });
  }

  const cle = `confirmer_pin:${session.profilId}`;
  const seuil = await chargerSeuil("seuil_tentatives_appareil_partage", 20);
  if (await estBloqueDb(cle, seuil)) {
    return NextResponse.json({ error: "Trop de tentatives. Réessaie dans quelques minutes." }, { status: 429 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profil } = await supabase.from("profils").select("pin_hash").eq("id", session.profilId).maybeSingle();

  if (profil?.pin_hash && (await verifySecret(pin, profil.pin_hash))) {
    await reinitialiserDb(cle);
    return NextResponse.json({ ok: true });
  }

  await enregistrerEchecDb(cle, FENETRE_MS);
  return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
}
