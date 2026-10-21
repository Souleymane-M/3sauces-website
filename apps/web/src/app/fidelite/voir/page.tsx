import type { Metadata } from "next";
import { chargerActivationParQrLivraison } from "@/lib/fidelite/activation";
import { VoirTamponsApp } from "@/components/fidelite/voir-tampons-app";

export const metadata: Metadata = {
  title: "Mes tampons — 3 Sauces",
};

interface VoirTamponsPageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function VoirTamponsPage({ searchParams }: VoirTamponsPageProps) {
  const { code } = await searchParams;
  const activation = code ? await chargerActivationParQrLivraison(code) : null;

  if (!activation || !code) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <p className="text-4xl">🎁</p>
        <h1 className="text-xl font-bold text-black">Voir mes tampons</h1>
        <p className="text-sm text-gray-600">
          Ce lien n&apos;est valable qu&apos;après une livraison — scanne le QR de ton reçu une fois ta commande
          reçue.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
      <VoirTamponsApp code={code} activationInitiale={activation} />
    </main>
  );
}
