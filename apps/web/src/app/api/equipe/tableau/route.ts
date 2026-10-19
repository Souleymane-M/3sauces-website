import { NextResponse } from "next/server";
import { listerTableauPublic } from "@/lib/equipe/tableau-public";

/**
 * Lecture du plateau partagé SANS connexion — sert l'affichage permanent
 * sur une tablette fixe (cuisine/comptoir), avant toute saisie de PIN.
 * Volontairement sans `requireRole` : c'est la route elle-même
 * (`listerTableauPublic`) qui garantit qu'aucun champ sensible (nom,
 * téléphone, adresse, montant) n'est jamais sélectionné en base — pas un
 * filtrage a posteriori qu'on pourrait oublier d'appliquer.
 */
export async function GET() {
  try {
    const commandes = await listerTableauPublic();
    return NextResponse.json({ commandes });
  } catch {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
