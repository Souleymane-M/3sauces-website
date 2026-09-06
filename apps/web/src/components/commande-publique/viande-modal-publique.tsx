"use client";

import { useState } from "react";
import type { ProduitPublic, ViandePublique, SaucePublique, SaveurPublique } from "@/lib/commande-publique/types";

export interface ExtrasChoisis {
  /** Une entrée par unité de viande supplémentaire choisie (doublons autorisés, illimité). */
  viandesSupplementaires: string[];
  /** Une entrée par unité de sauce supplémentaire choisie (doublons autorisés, illimité). */
  saucesSupplementaires: string[];
}

interface ViandeModalPubliqueProps {
  produit: ProduitPublic;
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  saveurs: SaveurPublique[];
  /** Produit "Viande supplémentaire" (prix affiché dynamiquement), null si indisponible. */
  produitViandeSupplementaire: ProduitPublic | null;
  /** Produit "Sauce supplémentaire" (prix affiché dynamiquement), null si indisponible. */
  produitSauceSupplementaire: ProduitPublic | null;
  onValider: (viandes: string[], sauces: string[], extras: ExtrasChoisis, boissonIncluse: string | null) => void;
  onAnnuler: () => void;
}

/**
 * Configurateur public (Menu Collégien / Menu Étudiant / Tacos / Barquette /
 * Bowl). Les règles affichées viennent entièrement du produit :
 *  - `viandeImposee` : viande fixe, pas de sélecteur (ex: Menu Collégien).
 *  - `nbViandesMax` : nombre de viandes à choisir (pastilles, doublons
 *    autorisés — ex: 2× Kebab sur un Tacos 2 viandes).
 *  - `nbSaucesIncluses` : nombre max de sauces incluses sans supplément
 *    (pastilles à cocher, sans doublon).
 *  - `autoriseExtras` : propose des ajouts payants illimités (viande/sauce
 *    supplémentaire), rendus comme lignes de panier distinctes par le parent.
 *  - `canetteIncluse` : une canette est incluse dans le prix (ex: Tacos,
 *    Barquette, Bowl, Menu Étudiant) — si plusieurs saveurs existent, le
 *    client choisit celle de sa canette incluse ici même (jamais dans une
 *    fenêtre séparée). S'il n'existe qu'une seule saveur (ou aucune), elle
 *    est retenue automatiquement sans rien demander au client.
 */
export function ViandeModalPublique({
  produit,
  viandes,
  sauces,
  saveurs,
  produitViandeSupplementaire,
  produitSauceSupplementaire,
  onValider,
  onAnnuler,
}: ViandeModalPubliqueProps) {
  const [viandesChoisies, setViandesChoisies] = useState<string[]>([]);
  const [saucesChoisies, setSaucesChoisies] = useState<string[]>([]);
  const [extraViandes, setExtraViandes] = useState<string[]>([]);
  const [extraSauces, setExtraSauces] = useState<string[]>([]);
  const [boissonChoisie, setBoissonChoisie] = useState<string | null>(null);

  const demandeViande = !produit.viandeImposee && produit.nbViandesMax > 0;
  const demandeChoixBoisson = produit.canetteIncluse && saveurs.length > 1;
  const boissonRetenue = !produit.canetteIncluse ? null : demandeChoixBoisson ? boissonChoisie : (saveurs[0]?.nom ?? null);
  const toutSelectionne =
    (!demandeViande || viandesChoisies.length === produit.nbViandesMax) &&
    (!demandeChoixBoisson || boissonChoisie !== null);

  function ajouterOccurrence(setter: (fn: (precedent: string[]) => string[]) => void, nom: string, max?: number) {
    setter((precedent) => {
      if (max !== undefined && precedent.length >= max) return precedent;
      return [...precedent, nom];
    });
  }

  function retirerOccurrence(setter: (fn: (precedent: string[]) => string[]) => void, nom: string) {
    setter((precedent) => {
      const index = precedent.lastIndexOf(nom);
      if (index === -1) return precedent;
      const copie = [...precedent];
      copie.splice(index, 1);
      return copie;
    });
  }

  function basculerSauceIncluse(nom: string) {
    setSaucesChoisies((precedent) => {
      if (precedent.includes(nom)) return precedent.filter((s) => s !== nom);
      if (precedent.length >= produit.nbSaucesIncluses) return precedent;
      return [...precedent, nom];
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
        {produit.description && <p className="text-sm text-gray-500">{produit.description}</p>}

        {produit.viandeImposee && (
          <p className="mt-3 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
            Viande : <strong>{produit.viandeImposee}</strong>
          </p>
        )}

        {demandeViande && (
          <div className="mt-4">
            <p className="text-sm font-bold text-[#8B2020]">
              Choisis {produit.nbViandesMax} viande{produit.nbViandesMax > 1 ? "s" : ""} — {viandesChoisies.length}/
              {produit.nbViandesMax}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {viandes.map((v) => {
                const count = viandesChoisies.filter((c) => c === v.nom).length;
                const desactivee = viandesChoisies.length >= produit.nbViandesMax;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={desactivee}
                    onClick={() => ajouterOccurrence(setViandesChoisies, v.nom, produit.nbViandesMax)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      count > 0
                        ? "border-[#8B2020] bg-[#8B2020] text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    } disabled:opacity-30`}
                  >
                    {v.nom}
                    {count > 1 ? ` ×${count}` : ""}
                  </button>
                );
              })}
            </div>
            {viandesChoisies.length > 0 && (
              <button
                type="button"
                onClick={() => setViandesChoisies([])}
                className="mt-2 text-xs text-gray-400 underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {produit.nbSaucesIncluses > 0 && sauces.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-bold text-[#2D5A27]">
              Sauces incluses (jusqu&apos;à {produit.nbSaucesIncluses}, optionnel) — {saucesChoisies.length}/
              {produit.nbSaucesIncluses}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sauces.map((s) => {
                const selectionnee = saucesChoisies.includes(s.nom);
                const desactivee = !selectionnee && saucesChoisies.length >= produit.nbSaucesIncluses;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={desactivee}
                    onClick={() => basculerSauceIncluse(s.nom)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      selectionnee
                        ? "border-[#2D5A27] bg-[#2D5A27] text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    } disabled:opacity-30`}
                  >
                    {s.nom}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {demandeChoixBoisson && (
          <div className="mt-5">
            <p className="text-sm font-bold text-[#C2540C]">Choisis ta canette incluse</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {saveurs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setBoissonChoisie(s.nom)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    boissonChoisie === s.nom
                      ? "border-[#C2540C] bg-[#C2540C] text-white"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {produit.autoriseExtras && produitViandeSupplementaire && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-sm font-bold text-[#8B2020]">
              Ajouter une viande supplémentaire (+{produitViandeSupplementaire.prix.toFixed(2)} € / viande)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {viandes.map((v) => {
                const count = extraViandes.filter((c) => c === v.nom).length;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => ajouterOccurrence(setExtraViandes, v.nom, 20)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      count > 0
                        ? "border-[#8B2020] bg-[#8B2020] text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {v.nom}
                    {count > 0 ? ` ×${count}` : ""}
                  </button>
                );
              })}
            </div>
            {extraViandes.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[...new Set(extraViandes)].map((nom) => (
                  <span
                    key={nom}
                    className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                  >
                    {nom} ×{extraViandes.filter((c) => c === nom).length}
                    <button
                      type="button"
                      onClick={() => retirerOccurrence(setExtraViandes, nom)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={`Retirer une unité de ${nom}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <span className="text-xs font-medium text-gray-600">
                  = {(extraViandes.length * produitViandeSupplementaire.prix).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        )}

        {produit.autoriseExtras && produitSauceSupplementaire && sauces.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-bold text-[#2D5A27]">
              Ajouter une sauce supplémentaire (+{produitSauceSupplementaire.prix.toFixed(2)} € / sauce)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sauces.map((s) => {
                const count = extraSauces.filter((c) => c === s.nom).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => ajouterOccurrence(setExtraSauces, s.nom, 20)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      count > 0
                        ? "border-[#2D5A27] bg-[#2D5A27] text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {s.nom}
                    {count > 0 ? ` ×${count}` : ""}
                  </button>
                );
              })}
            </div>
            {extraSauces.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[...new Set(extraSauces)].map((nom) => (
                  <span
                    key={nom}
                    className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                  >
                    {nom} ×{extraSauces.filter((c) => c === nom).length}
                    <button
                      type="button"
                      onClick={() => retirerOccurrence(setExtraSauces, nom)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={`Retirer une unité de ${nom}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <span className="text-xs font-medium text-gray-600">
                  = {(extraSauces.length * produitSauceSupplementaire.prix).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            disabled={!toutSelectionne}
            onClick={() =>
              onValider(
                viandesChoisies,
                saucesChoisies,
                {
                  viandesSupplementaires: extraViandes,
                  saucesSupplementaires: extraSauces,
                },
                boissonRetenue
              )
            }
            className="flex-1 rounded bg-[#8B2020] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
