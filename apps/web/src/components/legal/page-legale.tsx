import type { ReactNode } from "react";
import Link from "next/link";
import { FooterLegal } from "./footer-legal";

const ROUGE = "#8B2020";
const FOND_PAGE = "#F5F0E8";

export function PageLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <main className="min-h-screen" style={{ backgroundColor: FOND_PAGE }}>
      <div className="flex items-center gap-3 px-4 py-4" style={{ backgroundColor: ROUGE }}>
        <Link href="/commander" className="text-sm font-semibold text-white underline">
          ← Retour
        </Link>
      </div>
      <div className="mx-auto max-w-lg space-y-4 p-4 text-sm leading-relaxed text-gray-800">
        <h1 className="text-xl font-bold text-gray-900">{titre}</h1>
        {children}
        <FooterLegal />
      </div>
    </main>
  );
}
