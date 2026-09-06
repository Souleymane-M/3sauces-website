import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PasswordForm } from "@/components/auth/password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { PatronCommandesApp } from "@/components/commande-publique/patron-commandes-app";
import { PlatsDuJourApp } from "@/components/patron/plats-du-jour-app";
import { listerCommandesAdmin } from "@/lib/commande-publique/admin";
import { listerPlatsDuJourAdmin } from "@/lib/patron/plats-du-jour";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patron — 3 Sauces",
};

export default async function PatronPage() {
  const session = await requireRole(["patron"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <PasswordForm />
      </main>
    );
  }

  const [commandes, plats] = await Promise.all([listerCommandesAdmin(), listerPlatsDuJourAdmin()]);

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Espace Patron — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-500">
        Bonjour {session.nom}. Finances, stocks, fidélité : en construction (Module 6). Commandes du site en ligne et
        gestion des plats du jour ci-dessous.
      </p>
      <PatronCommandesApp commandesInitiales={commandes} />
      <PlatsDuJourApp platsInitiaux={plats} />
    </main>
  );
}
