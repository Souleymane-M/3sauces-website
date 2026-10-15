import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { lireEtatScan } from "@/lib/livreur/commandes";
import { ScanLivraisonApp } from "@/components/livreur/scan-livraison-app";

export const metadata: Metadata = {
  title: "Scan livraison — 3 Sauces",
};

export default async function ScanLivraisonPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await requireRole(["livreur"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <PinPad role="livreur" titre="Scan ticket — Code personnel" />
      </main>
    );
  }

  const etat = await lireEtatScan(code, session.profilId);

  return (
    <main className="min-h-screen bg-white p-4">
      <ScanLivraisonApp qrCode={code} etatInitial={etat} />
    </main>
  );
}
