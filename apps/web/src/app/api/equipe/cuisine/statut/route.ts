import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { changerStatutCommande } from "@/lib/cuisine/commandes";

/**
 * Transitions CUISINE de l'interface équipe unifiée : "En préparation"
 * (une commande à la fois — jamais de sélection multiple, pour ne jamais
 * marquer plusieurs commandes commencées alors qu'une seule l'est
 * vraiment) et "Prête" (sélection multiple autorisée). Même fonction
 * partagée que l'écran historique `/commandes` (`changerStatutCommande`),
 * jamais une deuxième implémentation de la machine à états.
 */
export async function PATCH(request: Request) {
  const session = await requireRoleMetier(["cuisine"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { commandeIds?: string[]; statut?: string; profilId?: string }
    | null;

  const commandeIds = Array.isArray(body?.commandeIds) ? body.commandeIds.filter((id) => typeof id === "string") : [];
  const statut = body?.statut;
  const profilId = body?.profilId;

  if (commandeIds.length === 0 || (statut !== "en_preparation" && statut !== "pret") || !profilId) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (statut === "en_preparation" && commandeIds.length !== 1) {
    return NextResponse.json({ error: '"En préparation" ne s\'applique qu\'à une seule commande à la fois.' }, { status: 400 });
  }

  try {
    for (const commandeId of commandeIds) {
      await changerStatutCommande({ commandeId, statut, profilId, roleMetier: "cuisine" });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
