import type { Metadata } from "next";
import Image from "next/image";
import { CommandePubliqueApp } from "@/components/commande-publique/commande-publique-app";
import {
  listerProduitsPublics,
  listerViandesPubliques,
  listerSaucesPubliques,
  listerSaveursPubliques,
} from "@/lib/commande-publique/produits";
import { chargerParametresLivraisonPublics } from "@/lib/commande-publique/parametres";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commander — 3 Sauces",
  description: "Commande en ligne — 3 Sauces, retrait sur place ou livraison à Dembéni.",
};

export default async function CommanderPage() {
  const [produits, viandes, sauces, saveurs, parametres] = await Promise.all([
    listerProduitsPublics(),
    listerViandesPubliques(),
    listerSaucesPubliques(),
    listerSaveursPubliques(),
    chargerParametresLivraisonPublics(),
  ]);

  return (
    <main className="min-h-screen bg-[#F5F0E8]">
      <div className="flex flex-col items-center gap-2 bg-[#8B2020] py-4">
        <h1>
          <Image
            src="/logo-3sauces.png"
            alt="3 Sauces"
            width={1600}
            height={800}
            priority
            className="h-auto w-44"
          />
        </h1>
        <p className="text-center text-sm font-bold tracking-wide text-white">
          GRILLADES · TACOS · CUISINE LOCALE
        </p>
      </div>
      <div className="mx-auto max-w-lg px-4 pt-6">
        <p className="text-sm text-gray-600">
          Retrait sur place, ou livraison à Dembéni (min. {parametres.minimumCommande.toFixed(2)} €). Paiement en
          espèces ou carte, sur place ou à la livraison.
        </p>
      </div>
      <CommandePubliqueApp
        produits={produits}
        viandes={viandes}
        sauces={sauces}
        saveurs={saveurs}
        parametres={parametres}
      />
    </main>
  );
}
