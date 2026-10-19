import { NextResponse } from "next/server";
import { requireRoleMetier } from "@/lib/auth/get-session";
import {
  listerProduitsActifs,
  listerViandesActives,
  listerSaucesActives,
  listerSaveursActives,
  listerParfums2lActifs,
} from "@/lib/caisse/produits";
import { chargerParametresLivraisonPublics } from "@/lib/commande-publique/parametres";
import { listerLivraisonsAEncaisser } from "@/lib/encaissements-livraison";

/**
 * Données nécessaires pour reprendre `CaisseApp`/`EncaissementsLivraisonCaisse`
 * (mêmes composants que `/caisse`, jamais une deuxième implémentation) dans
 * la vue COMPTOIR de l'interface équipe unifiée.
 */
export async function GET() {
  const session = await requireRoleMetier(["comptoir"]);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const [produits, viandes, sauces, saveurs, parfums2l, parametres, livraisonsAEncaisser] = await Promise.all([
      listerProduitsActifs(),
      listerViandesActives(),
      listerSaucesActives(),
      listerSaveursActives(),
      listerParfums2lActifs(),
      chargerParametresLivraisonPublics(),
      listerLivraisonsAEncaisser(),
    ]);
    return NextResponse.json({ produits, viandes, sauces, saveurs, parfums2l, parametres, livraisonsAEncaisser });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
