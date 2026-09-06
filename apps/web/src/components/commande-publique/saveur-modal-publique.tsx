"use client";

import { useState } from "react";
import type { ProduitPublic, SaveurPublique } from "@/lib/commande-publique/types";

interface SaveurModalPubliqueProps {
  produit: ProduitPublic;
  saveurs: SaveurPublique[];
  onValider: (saveur: string) => void;
  onAnnuler: () => void;
}

/**
 * Configurateur simplifié pour un produit à choix de saveur unique et
 * obligatoire (ex: Canette 33cl) : une seule saveur sélectionnable parmi
 * `saveurs`, pas de sauces ni d'extras — cf. ViandeModalPublique pour le
 * configurateur complet (Menus/Tacos/Barquette/Bowl).
 */
export function SaveurModalPublique({ produit, saveurs, onValider, onAnnuler }: SaveurModalPubliqueProps) {
  const [saveurChoisie, setSaveurChoisie] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 text-gray-900 sm:rounded-2xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold">{produit.nom}</h2>
          <button
            onClick={onAnnuler}
            aria-label="Fermer"
            className="-mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">Choisis une saveur</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {saveurs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSaveurChoisie(s.nom)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  saveurChoisie === s.nom
                    ? "border-[#8B2020] bg-[#8B2020] text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {s.nom}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            disabled={!saveurChoisie}
            onClick={() => saveurChoisie && onValider(saveurChoisie)}
            className="flex-1 rounded bg-[#8B2020] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
