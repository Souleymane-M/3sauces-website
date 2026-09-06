"use client";

import { useState } from "react";
import type { ProduitConfigurable } from "@/lib/commande-publique/types";

interface QuantiteModalPubliqueProps {
  produit: ProduitConfigurable;
  onValider: (quantite: number, prixSaisi?: number) => void;
  onAnnuler: () => void;
}

const QUANTITE_MAX = 20;

/**
 * Configurateur minimal pour un produit sans décision à prendre (Grillades,
 * Accompagnements, boissons à saveur unique) : juste un compteur de
 * quantité, avec le total en € bien visible pendant l'ajustement — pour
 * que le client vise un montant précis (ex: "10€ de brochettes") au lieu
 * de cliquer à l'aveugle plusieurs fois sur la carte produit.
 *
 * `produit.prix === null` (caisse uniquement — ex: "Plat du jour" à prix
 * saisi chaque jour ; jamais le cas côté site public, déjà exclu de
 * `listerProduitsPublics`) : demande un prix avant d'activer "Ajouter",
 * utilisé à la place de `produit.prix` pour le total affiché.
 */
export function QuantiteModalPublique({ produit, onValider, onAnnuler }: QuantiteModalPubliqueProps) {
  const [quantite, setQuantite] = useState(1);
  const [prixSaisi, setPrixSaisi] = useState("");

  const demandePrixLibre = produit.prix === null;
  const prixUnitaire = produit.prix ?? Number(prixSaisi.replace(",", "."));
  const prixValide = !demandePrixLibre || (Number.isFinite(prixUnitaire) && prixUnitaire > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="w-full max-w-sm overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 text-gray-900 sm:rounded-2xl">
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
        {produit.description && <p className="text-sm text-gray-500">{produit.description}</p>}

        {demandePrixLibre ? (
          <div className="mt-3">
            <label className="text-sm font-bold text-[#8B2020]">Prix du jour (€)</label>
            <input
              value={prixSaisi}
              onChange={(e) => setPrixSaisi(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="mt-1 w-full rounded border border-gray-300 p-2 text-base text-gray-900"
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-500">{prixUnitaire.toFixed(2)} € / unité</p>
        )}

        <div className="mt-6 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setQuantite((q) => Math.max(1, q - 1))}
            disabled={quantite <= 1}
            aria-label="Retirer une unité"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-10 text-center text-2xl font-bold text-gray-900">{quantite}</span>
          <button
            type="button"
            onClick={() => setQuantite((q) => Math.min(QUANTITE_MAX, q + 1))}
            disabled={quantite >= QUANTITE_MAX}
            aria-label="Ajouter une unité"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-30"
          >
            +
          </button>
        </div>

        <p className="mt-6 text-center text-4xl font-extrabold text-[#8B2020]">
          {(prixValide ? prixUnitaire * quantite : 0).toFixed(2)} €
        </p>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            disabled={!prixValide}
            onClick={() => onValider(quantite, demandePrixLibre ? prixUnitaire : undefined)}
            className="flex-1 rounded bg-[#8B2020] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
