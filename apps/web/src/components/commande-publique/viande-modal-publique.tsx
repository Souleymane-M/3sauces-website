"use client";

import { useState } from "react";
import type { ProduitPublic, ViandePublique, SaucePublique } from "@/lib/commande-publique/types";
import { NB_SAUCES_MAX, CATEGORIES_AVEC_SAUCES } from "@/lib/commande-publique/types";

export interface ExtrasChoisis {
  viandeSupplementaire: string | null;
  sauceSupplementaire: string | null;
}

interface ViandeModalPubliqueProps {
  produit: ProduitPublic;
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  /** Produit "Viande supplémentaire" (prix affiché dynamiquement), null si indisponible. */
  produitViandeSupplementaire: ProduitPublic | null;
  /** Produit "Sauce supplémentaire" (prix affiché dynamiquement), null si indisponible. */
  produitSauceSupplementaire: ProduitPublic | null;
  onValider: (viandes: string[], sauces: string[], extras: ExtrasChoisis) => void;
  onAnnuler: () => void;
}

/**
 * Équivalent public de `caisse/viande-modal.tsx`, sans la case "prix libre"
 * (le menu public exclut déjà les produits à prix null — cf. commande-publique/types.ts).
 *
 * Étendu pour inclure :
 *  - la sélection de sauces incluses (jusqu'à 3, sans supplément) ;
 *  - des ajouts optionnels payants (viande/sauce supplémentaire) ;
 * sur les produits snacking (Tacos/Barquette/Bowl) — cf. CATEGORIES_AVEC_SAUCES.
 *
 * Ce composant n'est jamais ouvert pour un produit "verrouillé"
 * (produit.viandeImposee renseigné, ex: Menu Collégien) : ce cas est géré en
 * amont dans commande-publique-app.tsx, qui ajoute directement au panier sans
 * passer par cette modale.
 */
export function ViandeModalPublique({
  produit,
  viandes,
  sauces,
  produitViandeSupplementaire,
  produitSauceSupplementaire,
  onValider,
  onAnnuler,
}: ViandeModalPubliqueProps) {
  const [choix, setChoix] = useState<string[]>(
    Array.from({ length: produit.nbViandesMax }, () => "")
  );
  const [saucesChoisies, setSaucesChoisies] = useState<string[]>([]);
  const [viandeSupp, setViandeSupp] = useState("");
  const [sauceSupp, setSauceSupp] = useState("");

  const toutSelectionne = choix.every((v) => v !== "");
  const proposeExtras = CATEGORIES_AVEC_SAUCES.includes(produit.categorie);
  const proposeSauces = proposeExtras && sauces.length > 0;

  function basculerSauce(nom: string) {
    setSaucesChoisies((precedent) => {
      if (precedent.includes(nom)) {
        return precedent.filter((s) => s !== nom);
      }
      if (precedent.length >= NB_SAUCES_MAX) {
        return precedent;
      }
      return [...precedent, nom];
    });
  }

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

        {proposeSauces && (
          <div className="mt-5">
            <p className="text-sm text-gray-400">
              Sauces incluses (jusqu&apos;à {NB_SAUCES_MAX}, optionnel) — {saucesChoisies.length}/{NB_SAUCES_MAX}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sauces.map((s) => {
                const selectionnee = saucesChoisies.includes(s.nom);
                const desactivee = !selectionnee && saucesChoisies.length >= NB_SAUCES_MAX;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={desactivee}
                    onClick={() => basculerSauce(s.nom)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectionnee
                        ? "border-white bg-white text-black"
                        : "border-gray-600 text-gray-300 hover:bg-gray-900"
                    } disabled:opacity-30`}
                  >
                    {s.nom}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {proposeExtras && produitViandeSupplementaire && (
          <div className="mt-5">
            <label className="text-sm text-gray-400">
              Ajouter une viande supplémentaire (+{produitViandeSupplementaire.prix.toFixed(2)} €)
            </label>
            <select
              value={viandeSupp}
              onChange={(e) => setViandeSupp(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-black p-2 text-sm"
            >
              <option value="">Aucune</option>
              {viandes.map((v) => (
                <option key={v.id} value={v.nom}>
                  {v.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        {proposeExtras && produitSauceSupplementaire && sauces.length > 0 && (
          <div className="mt-3">
            <label className="text-sm text-gray-400">
              Ajouter une sauce supplémentaire (+{produitSauceSupplementaire.prix.toFixed(2)} €)
            </label>
            <select
              value={sauceSupp}
              onChange={(e) => setSauceSupp(e.target.value)}
              className="mt-1 w-full rounded border border-gray-600 bg-black p-2 text-sm"
            >
              <option value="">Aucune</option>
              {sauces.map((s) => (
                <option key={s.id} value={s.nom}>
                  {s.nom}
                </option>
              ))}
            </select>
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
            disabled={!toutSelectionne}
            onClick={() =>
              onValider(choix, saucesChoisies, {
                viandeSupplementaire: viandeSupp || null,
                sauceSupplementaire: sauceSupp || null,
              })
            }
            className="flex-1 rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
