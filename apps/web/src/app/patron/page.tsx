import { requireRole } from "@/lib/auth/get-session";
import { PasswordForm } from "@/components/auth/password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { PatronCommandesApp } from "@/components/commande-publique/patron-commandes-app";
import { listerCommandesAdmin } from "@/lib/commande-publique/admin";

export const dynamic = "force-dynamic";

export default async function PatronPage() {
  const session = await requireRole(["patron"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <PasswordForm />
      </main>
    );
  }

  const commandes = await listerCommandesAdmin();

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Espace Patron — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-500">
        Bonjour {session.nom}. Finances, stocks, fidélité : en construction (Module 6). Commandes du site en ligne
        ci-dessous.
      </p>
      <PatronCommandesApp commandesInitiales={commandes} />
    </main>
  );
}
