"use client";

import { useState } from "react";
import type { ProduitCaisse, ViandeCaisse } from "@/lib/caisse/types";

interface ViandeModalProps {
  produit: ProduitCaisse;
  viandes: ViandeCaisse[];
  onValider: (viandes: string[], prixSaisi?: number) => void;
  onAnnuler: () => void;
}

export function ViandeModal({ produit, viandes, onValider, onAnnuler }: ViandeModalProps) {
  const [choix, setChoix] = useState<string[]>(
    Array.from({ length: produit.nbViandesMax }, () => "")
  );
  const [prixSaisi, setPrixSaisi] = useState("");

  const toutSelectionne = choix.every((v) => v !== "");
  const prixValide = produit.prix !== null || Number(prixSaisi) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-black p-5">
        <h2 className="text-lg font-bold">{produit.nom}</h2>
        <p className="mt-1 text-sm text-gray-400">
          Choisis {produit.nbViandesMax} viande{produit.nbViandesMax > 1 ? "s" : ""}.
        </p>

        <div className="mt-4 space-y-3">
          {choix.map((valeur, index) => (
            <select
              key={index}
              value={valeur}
              onChange={(e) => {
                const copie = [...choix];
                copie[index] = e.target.value;
                setChoix(copie);
              }}
              className="w-full rounded border border-gray-600 bg-black p-2 text-sm"
            >
              <option value="">Viande {index + 1}…</option>
              {viandes.map((v) => (
                <option key={v.id} value={v.nom}>
                  {v.nom}
                </option>
              ))}
            </select>
          ))}
        </div>

        {produit.prix === null && (
          <div className="mt-4">
            <label className="text-sm text-gray-400">Prix du jour (€)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={prixSaisi}
              onChange={(e) => setPrixSaisi(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-black p-2 text-sm"
            />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-600 py-2 text-sm hover:bg-gray-900"
          >
            Annuler
          </button>
          <button
            disabled={!toutSelectionne || !prixValide}
            onClick={() => onValider(choix, produit.prix === null ? Number(prixSaisi) : undefined)}
            className="flex-1 rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
