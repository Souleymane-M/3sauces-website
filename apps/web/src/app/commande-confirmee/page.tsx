import Link from "next/link";

interface CommandeConfirmeePageProps {
  searchParams: Promise<{ canal?: string; heure?: string }>;
}

export default async function CommandeConfirmeePage({ searchParams }: CommandeConfirmeePageProps) {
  const { canal, heure } = await searchParams;
  const estLivraison = canal === "livraison";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">✅</p>
      <h1 className="text-2xl font-bold">Votre commande est bien reçue</h1>
      {heure && (
        <p className="text-lg text-gray-300">
          {estLivraison ? `Vous serez livré à ${heure}.` : `Vous pourrez récupérer votre commande à ${heure}.`}
        </p>
      )}
      <p className="text-sm text-gray-500">Paiement en espèces ou par carte, à la {estLivraison ? "livraison" : "prise en main"}.</p>
      <Link href="/commander" className="mt-4 rounded bg-white px-4 py-2 text-sm font-semibold text-black">
        Nouvelle commande
      </Link>
    </main>
  );
}
