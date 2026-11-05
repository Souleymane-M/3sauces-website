import type { Metadata } from "next";
import { DesinscriptionApp } from "./desinscription-app";

export const metadata: Metadata = {
  title: "Désinscription — 3 Sauces",
  robots: { index: false, follow: false },
};

export default async function DesinscriptionPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-6">
      <DesinscriptionApp jeton={typeof jeton === "string" ? jeton : ""} />
    </main>
  );
}
