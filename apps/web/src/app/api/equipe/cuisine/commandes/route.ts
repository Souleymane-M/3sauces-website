import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import { listerCommandesActives, listerCommandesAVenir, listerLivraisonsEnCours } from "@/lib/cuisine/commandes";

/**
 * Commandes pour la vue CUISINE de l'interface équipe unifiée — jamais de
 * prix ni de coordonnées client (demande explicite du patron, 2026-10-19),
 * contrairement à l'écran historique `/commandes`. Projection faite ici,
 * au plus près de la réponse réseau, plutôt que dans une nouvelle fonction
 * de lib : un seul endroit à auditer pour être sûr qu'aucun champ sensible
 * ne part jamais vers ce rôle.
 */
export async function GET() {
  const session = await requireRoleMetier(["cuisine"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const [commandes, aVenir, enLivraison] = await Promise.all([
      listerCommandesActives(),
      listerCommandesAVenir(),
      listerLivraisonsEnCours(),
    ]);
    const projeter = (liste: typeof commandes) =>
      liste.map((c) => ({
        id: c.id,
        numero: c.numero,
        canal: c.canal,
        statut: c.statut,
        lignes: c.lignes,
        heureSouhaitee: c.heureSouhaitee,
        creeLe: c.creeLe,
        nbPlats: c.nbPlats,
        palierGroupe: c.palierGroupe,
        commandeAvance: c.commandeAvance,
        ticketImprimeLe: c.ticketImprimeLe,
        statutChangeLe: c.statutChangeLe,
      }));
    // Colonne "En cours de livraison" : jamais de montant, nom, téléphone ni
    // adresse (contrairement à `LivraisonEnCours` complet, utilisé par
    // l'écran historique `/commandes`) — même restriction que le reste de
    // cette vue.
    const enLivraisonProjetee = enLivraison.map((l) => ({
      id: l.id,
      numero: l.numero,
      lignes: l.lignes,
      heureSouhaitee: l.heureSouhaitee,
      creeLe: l.creeLe,
      livreurNom: l.livreurNom,
      alerteSignalee: l.alerteSignalee,
      alerteNote: l.alerteNote,
      alerteSignaleeLe: l.alerteSignaleeLe,
    }));
    return NextResponse.json({ commandes: projeter(commandes), aVenir: projeter(aVenir), enLivraison: enLivraisonProjetee });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
