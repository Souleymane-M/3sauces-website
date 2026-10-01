"use client";

import { type ReactNode, useState } from "react";

interface Onglet {
  id: string;
  label: string;
  contenu: ReactNode;
}

/**
 * Rubriques pour /patron — avant ça, tout était empilé verticalement (12
 * blocs) et le patron mettait "mille ans" à retrouver quoi que ce soit. Un
 * seul onglet affiché à la fois, aucune dépendance externe.
 */
export function PatronTabs({ onglets }: { onglets: Onglet[] }) {
  const [actif, setActif] = useState(onglets[0]?.id);

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
        {onglets.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setActif(o.id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              actif === o.id ? "border-[#8B2020] text-[#8B2020]" : "border-transparent text-gray-500"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {onglets.find((o) => o.id === actif)?.contenu}
    </div>
  );
}
