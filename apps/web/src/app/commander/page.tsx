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
  description:
    "Grillades au charbon, tacos généreux, cuisine locale à Iloni/Dembéni. Commandez en ligne, sur place ou livré. Menus dès 5€. 3sauces.fr",
};

export default async function CommanderPage() {
  const [produits, viandes, sauces, saveurs, parametres] = await Promise.all([
    listerProduitsPublics(),
    listerViandesPubliques(),
    listerSaucesPubliques(),
    listerSaveursPubliques(),
    chargerParametresLivraisonPublics(),
  ]);

  const enTete = (
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
      <a href="tel:0639638178" className="flex items-center gap-1.5 text-sm font-semibold text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1z" />
        </svg>
        06 39 63 81 78
      </a>
    </div>
  );

  if (!parametres.siteOuvert) {
    return (
      <main className="min-h-screen bg-[#F5F0E8]">
        {enTete}
        <div className="mx-auto max-w-lg space-y-2 p-8 text-center">
          <h2 className="text-xl font-bold text-gray-900">Fermé pour le moment</h2>
          <p className="text-sm text-gray-600">
            On ne prend pas de commande en ce moment — repasse un peu plus tard !
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F0E8]">
      {enTete}
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
