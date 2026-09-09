import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";
import { EncaissementsLivraisonCaisse } from "@/components/caisse/encaissements-livraison-caisse";
import { listerLivraisonsAEncaisser } from "@/lib/encaissements-livraison";

export const metadata: Metadata = {
  title: "Encaissements livraison — 3 Sauces",
};

export default async function CaisseEncaissementsPage() {
  const session = await requireRole(["employe"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-8">
        <PinPad role="employe" titre="Caisse — Code employé" />
      </main>
    );
  }

  const livraisons = await listerLivraisonsAEncaisser();

  return (
    <main className="min-h-screen bg-[#F5F0E8] p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Encaissements livraison</h1>
        <LogoutButton />
      </div>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        <Link href="/caisse" className="underline">
          ← Retour à la caisse
        </Link>
      </p>
      <EncaissementsLivraisonCaisse livraisonsInitiales={livraisons} />
    </main>
  );
}
