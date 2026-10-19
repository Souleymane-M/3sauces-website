import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { verifySecret } from "@/lib/auth/crypto";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { estBloqueDb, enregistrerEchecDb, reinitialiserDb } from "@/lib/auth/rate-limit-db";
import { chargerRolesMetier } from "@/lib/auth/roles-metier";
import { chargerSeuil } from "@/lib/patron/seuils";

const FENETRE_APPAREIL_MS = 5 * 60 * 1000; // 5 minutes
const FENETRE_IP_MS = 60 * 60 * 1000; // 1 heure

/**
 * Connexion employé/livreur par code PIN.
 * Body attendu : { pin: string, role?: "employe" | "livreur", appareilId?: string }
 *
 * `role` reste obligatoire pour les écrans existants (/commandes, /caisse,
 * /livreur/scan — un seul type de compte possible à cet endroit). Omis
 * (entrée unifiée `/equipe`, qui n'affiche pas de sélection de rôle avant
 * le PIN), on cherche indifféremment parmi les comptes employé ET livreur,
 * avec le plafond "appareil partagé" (une tablette unique peut servir à
 * n'importe qui).
 *
 * Comme les PIN sont hashés avec un sel différent par profil (bcrypt), on ne
 * peut pas chercher directement par hash : on récupère les profils actifs
 * concernés (une poignée par restaurant) et on compare un par un.
 *
 * Double plafond anti-bruteforce (demande explicite du patron, 2026-10-19) :
 * un plafond par APPAREIL (`appareilId`, généré et stocké côté navigateur),
 * plus large pour un appareil partagé (tablette cuisine/comptoir, plusieurs
 * personnes y tapent leur PIN) que pour l'appareil d'un livreur — et un
 * plafond par IP, plus large encore, en filet de sécurité : l'identifiant
 * d'appareil vient du navigateur et peut être changé/effacé à chaque essai,
 * contrairement à l'IP.
 */
export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") ?? "local";

  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const roleDemande = body?.role === "employe" || body?.role === "livreur" ? body.role : null;
  const appareilId = typeof body?.appareilId === "string" ? body.appareilId.slice(0, 100) : null;

  if (!pin) {
    return NextResponse.json(
      { error: "Requête invalide : pin est requis." },
      { status: 400 }
    );
  }

  const [seuilAppareil, seuilIp] = await Promise.all([
    chargerSeuil(roleDemande === "livreur" ? "seuil_tentatives_appareil_livreur" : "seuil_tentatives_appareil_partage", roleDemande === "livreur" ? 5 : 20),
    chargerSeuil("seuil_tentatives_ip_horaire", 30),
  ]);

  const cleIp = `pin_ip:${ip}`;
  const cleAppareil = appareilId ? `pin_appareil:${appareilId}` : null;

  if (await estBloqueDb(cleIp, seuilIp)) {
    return NextResponse.json(
      { error: "Trop de tentatives depuis ce réseau. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }
  if (cleAppareil && (await estBloqueDb(cleAppareil, seuilAppareil))) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: profils, error } = await supabase
    .from("profils")
    .select("id, nom, role, pin_hash")
    .in("role", roleDemande ? [roleDemande] : ["employe", "livreur"])
    .eq("actif", true);

  if (error) {
    return NextResponse.json(
      { error: "Erreur serveur, réessaie." },
      { status: 500 }
    );
  }

  for (const profil of profils ?? []) {
    if (profil.pin_hash && (await verifySecret(pin, profil.pin_hash))) {
      await Promise.all([reinitialiserDb(cleIp), cleAppareil ? reinitialiserDb(cleAppareil) : Promise.resolve()]);

      const rolesMetier = await chargerRolesMetier(profil.id);
      const token = await createSessionToken({
        profilId: profil.id,
        role: profil.role as "employe" | "livreur",
        nom: profil.nom,
        rolesMetier,
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

  await Promise.all([
    enregistrerEchecDb(cleIp, FENETRE_IP_MS),
    cleAppareil ? enregistrerEchecDb(cleAppareil, FENETRE_APPAREIL_MS) : Promise.resolve(),
  ]);
  return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
}
