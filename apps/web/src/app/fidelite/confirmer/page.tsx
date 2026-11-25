import type { Metadata } from "next";
import { ConfirmerEmailApp } from "@/components/fidelite/confirmer-email-app";

export const metadata: Metadata = {
  title: "Confirmer mon email — 3 Sauces",
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ jeton?: string }>;
}

export default async function ConfirmerEmailPage({ searchParams }: Props) {
  const { jeton } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
      <ConfirmerEmailApp jeton={typeof jeton === "string" ? jeton : ""} />
    </main>
  );
}
