import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function LivreurPage() {
  const session = await requireRole(["livreur"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <PinPad role="livreur" titre="Livreur — Code personnel" />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Livreur — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Bonjour {session.nom}. Mes tournées, nouvelle commande terrain,
        récapitulatif du jour. (En construction — Module 2)
      </p>
    </main>
  );
}
