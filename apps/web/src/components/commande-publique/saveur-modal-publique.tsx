"use client";

import { useState } from "react";
import type { ProduitPublic, SaveurPublique } from "@/lib/commande-publique/types";

interface SaveurModalPubliqueProps {
  produit: ProduitPublic;
  saveurs: SaveurPublique[];
  onValider: (saveurs: string[]) => void;
  onAnnuler: () => void;
}

/**
 * Configurateur pour un produit vendu directement à la saveur (ex: Canette
 * 33cl) : pastilles à compteur, cliquables plusieurs fois pour composer
 * plusieurs boissons (identiques ou différentes) en une seule fois — même
 * logique que les pastilles viandes/extras de ViandeModalPublique, pour
 * ne jamais obliger à rouvrir la fenêtre pour une 2e unité.
 */
export function SaveurModalPublique({ produit, saveurs, onValider, onAnnuler }: SaveurModalPubliqueProps) {
  const [saveursChoisies, setSaveursChoisies] = useState<string[]>([]);

  function ajouterOccurrence(nom: string) {
    setSaveursChoisies((precedent) => (precedent.length >= 20 ? precedent : [...precedent, nom]));
  }

  function retirerOccurrence(nom: string) {
    setSaveursChoisies((precedent) => {
      const index = precedent.lastIndexOf(nom);
      if (index === -1) return precedent;
      const copie = [...precedent];
      copie.splice(index, 1);
      return copie;
    });
  }

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
          <p className="text-sm font-medium text-gray-700">Choisis tes saveurs (autant que tu veux)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {saveurs.map((s) => {
              const count = saveursChoisies.filter((c) => c === s.nom).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ajouterOccurrence(s.nom)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    count > 0
                      ? "border-[#8B2020] bg-[#8B2020] text-white"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s.nom}
                  {count > 1 ? ` ×${count}` : ""}
                </button>
              );
            })}
          </div>

          {saveursChoisies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[...new Set(saveursChoisies)].map((nom) => (
                <span
                  key={nom}
                  className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                >
                  {nom} ×{saveursChoisies.filter((c) => c === nom).length}
                  <button
                    type="button"
                    onClick={() => retirerOccurrence(nom)}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label={`Retirer une unité de ${nom}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <span className="text-xs font-medium text-gray-600">
                = {(saveursChoisies.length * produit.prix).toFixed(2)} €
              </span>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            disabled={saveursChoisies.length === 0}
            onClick={() => onValider(saveursChoisies)}
            className="flex-1 rounded bg-[#8B2020] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
