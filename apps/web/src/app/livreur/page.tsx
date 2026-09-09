import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";
import { LivreurApp } from "@/components/livreur/livreur-app";
import { listerLivraisonsAssignees } from "@/lib/livreur/commandes";

export const metadata: Metadata = {
  title: "Livreur — 3 Sauces",
};

export default async function LivreurPage() {
  const session = await requireRole(["livreur"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <PinPad role="livreur" titre="Livreur — Code personnel" />
      </main>
    );
  }

  const livraisons = await listerLivraisonsAssignees(session.profilId);

  return (
    <main className="min-h-screen bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Livreur — {session.nom}</h1>
        <LogoutButton />
      </div>
      <LivreurApp livraisonsInitiales={livraisons} />
    </main>
  );
}
