import type { Metadata } from "next";
import { CommandePubliqueApp } from "@/components/commande-publique/commande-publique-app";
import { listerProduitsPublics, listerViandesPubliques } from "@/lib/commande-publique/produits";
import { chargerParametresLivraisonPublics } from "@/lib/commande-publique/parametres";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commander — 3 Sauces",
  description: "Commande en ligne — 3 Sauces, retrait sur place ou livraison à Dembéni.",
};

export default async function CommanderPage() {
  const [produits, viandes, parametres] = await Promise.all([
    listerProduitsPublics(),
    listerViandesPubliques(),
    chargerParametresLivraisonPublics(),
  ]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <h1 className="text-2xl font-bold">3 Sauces</h1>
        <p className="mt-1 text-sm text-gray-500">
          Retrait sur place, ou livraison à Dembéni (min. {parametres.minimumCommande.toFixed(2)} €). Paiement en
          espèces ou carte, sur place ou à la livraison.
        </p>
      </div>
      <CommandePubliqueApp produits={produits} viandes={viandes} parametres={parametres} />
    </main>
  );
}
