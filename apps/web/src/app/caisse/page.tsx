import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { LogoutButton } from "@/components/auth/logout-button";
import { CaisseApp } from "@/components/caisse/caisse-app";
import { listerProduitsActifs, listerViandesActives } from "@/lib/caisse/produits";

export default async function CaissePage() {
  const session = await requireRole(["employe"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <PinPad role="employe" titre="Caisse — Code employé" />
      </main>
    );
  }

  const [produits, viandes] = await Promise.all([
    listerProduitsActifs(),
    listerViandesActives(),
  ]);

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caisse — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Prise de commande. Le stock/approvisionnement arrive avec le Module 3.
      </p>
      <CaisseApp produits={produits} viandes={viandes} nomEmploye={session.nom} />
    </main>
  );
}
