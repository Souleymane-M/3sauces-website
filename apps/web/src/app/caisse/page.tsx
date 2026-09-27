import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";
import { CaisseApp } from "@/components/caisse/caisse-app";
import {
  listerProduitsActifs,
  listerViandesActives,
  listerSaucesActives,
  listerSaveursActives,
  listerParfums2lActifs,
} from "@/lib/caisse/produits";
import { chargerParametresLivraisonPublics } from "@/lib/commande-publique/parametres";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";
import { listerLivraisonsAEncaisser } from "@/lib/encaissements-livraison";
import { listerCommandesActives } from "@/lib/cuisine/commandes";
import { chargerCommandePourModification } from "@/lib/caisse/modification";

export const metadata: Metadata = {
  title: "Caisse — 3 Sauces",
};

interface CaissePageProps {
  searchParams: Promise<{ modifier?: string }>;
}

export default async function CaissePage({ searchParams }: CaissePageProps) {
  const session = await requireRole(["employe"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-8">
        <PinPad role="employe" titre="Caisse — Code employé" />
      </main>
    );
  }

  const { modifier } = await searchParams;

  const [produits, viandes, sauces, saveurs, parfums2l, parametres, imprimantes, livraisonsAEncaisser, commandesActives, modification] =
    await Promise.all([
      listerProduitsActifs(),
      listerViandesActives(),
      listerSaucesActives(),
      listerSaveursActives(),
      listerParfums2lActifs(),
      chargerParametresLivraisonPublics(),
      listerImprimantesAdmin(),
      listerLivraisonsAEncaisser(),
      listerCommandesActives(),
      modifier ? chargerCommandePourModification(modifier) : Promise.resolve(null),
    ]);

  if (modifier && modification?.erreur) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-8">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-red-700">{modification.erreur}</p>
          <Link
            href="/commandes"
            className="mt-4 inline-block rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white"
          >
            Retour aux commandes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F0E8] p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Caisse — 3 Sauces</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/commandes"
            className="flex items-center gap-2 rounded bg-[#2D5A27] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Commandes en cuisine
            {commandesActives.length > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#2D5A27]">
                {commandesActives.length}
              </span>
            )}
          </Link>
          <Link
            href="/caisse/encaissements"
            className="flex items-center gap-2 rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Encaissements livraison
            {livraisonsAEncaisser.length > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#8B2020]">
                {livraisonsAEncaisser.length}
              </span>
            )}
          </Link>
          <LogoutButton />
        </div>
      </div>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Prise de commande. Le stock/approvisionnement arrive avec le Module 3.
      </p>
      <CaisseApp
        produits={produits}
        viandes={viandes}
        sauces={sauces}
        saveurs={saveurs}
        parfums2l={parfums2l}
        parametres={parametres}
        imprimantesInitiales={imprimantes}
        nomEmploye={session.nom}
        commandeExistante={modification?.commande ?? null}
      />
    </main>
  );
}
