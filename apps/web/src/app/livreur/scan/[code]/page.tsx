import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/get-session";
import { PinPad } from "@/components/auth/pin-pad";
import { lireEtatScan, commandeDuQrCodeEstFinalisee } from "@/lib/livreur/commandes";
import { ScanLivraisonApp } from "@/components/livreur/scan-livraison-app";

export const metadata: Metadata = {
  title: "Scan livraison — 3 Sauces",
};

export default async function ScanLivraisonPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Avant même de proposer le PIN livreur : le client scanne son reçu une
  // fois la commande déjà livrée/remise/annulée bien plus souvent qu'un
  // livreur ne scanne un ticket légitime. Redirection sans aucun rendu
  // interne, aucune information de commande, aucun champ PIN — vers la
  // page "voir mes tampons" plutôt que l'accueil générique (demande
  // explicite du patron, 2026-10-21) : elle reconnaît le client par cette
  // livraison précise et, si son email n'est pas encore connu, le lui
  // demande pour débloquer l'accès — objectif : récupérer le maximum
  // d'emails au moment le plus naturel, juste après la livraison.
  if (await commandeDuQrCodeEstFinalisee(code)) {
    redirect(`https://3sauces.fr/fidelite/voir?code=${code}`);
  }

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
