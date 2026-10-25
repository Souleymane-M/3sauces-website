import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { TiroirCaisseApp } from "@/components/caisse/tiroir-caisse-app";

export const metadata: Metadata = {
  title: "Tiroir-caisse — 3 Sauces",
};

export default async function TiroirPage() {
  const session = await requireRole(["employe"]);
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-8">
        <PinPad role="employe" titre="Tiroir-caisse — Code employé" />
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-[#F5F0E8] p-8">
      <Link href="/caisse" className="text-sm text-gray-500 underline">
        ← Retour à la caisse
      </Link>
      <div className="mx-auto max-w-2xl">
        <TiroirCaisseApp />
      </div>
    </main>
  );
}
