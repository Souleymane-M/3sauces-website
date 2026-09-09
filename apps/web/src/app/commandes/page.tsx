import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";
import { CommandesApp } from "@/components/cuisine/commandes-app";
import { listerCommandesActives, listerLivreursActifs } from "@/lib/cuisine/commandes";

export const metadata: Metadata = {
  title: "Commandes — 3 Sauces",
};

export default async function CommandesPage() {
  const session = await requireRole(["employe"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <PinPad role="employe" titre="Commandes — Code employé" />
      </main>
    );
  }

  const [commandes, livreurs] = await Promise.all([listerCommandesActives(), listerLivreursActifs()]);

  return (
    <main className="min-h-screen bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-black">Commandes — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <CommandesApp commandesInitiales={commandes} livreursActifs={livreurs} />
    </main>
  );
}
