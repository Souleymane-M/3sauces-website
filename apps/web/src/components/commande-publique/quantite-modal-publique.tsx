"use client";

import { useState } from "react";
import type { ProduitConfigurable, SaveurPublique } from "@/lib/commande-publique/types";
import { piecesParPaquet } from "@/lib/pieces-produit";

interface QuantiteModalPubliqueProps {
  produit: ProduitConfigurable;
  onValider: (quantite: number, prixSaisi?: number, canettesChoisies?: string[]) => void;
  onAnnuler: () => void;
  /** Boisson proposée en ajout rapide (Plats du jour uniquement) — évite d'aller la chercher dans une autre section. `null`/omis = pas de section boisson. */
  canetteProduit?: ProduitConfigurable | null;
  canetteSaveurs?: SaveurPublique[];
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
export function QuantiteModalPublique({
  produit,
  onValider,
  onAnnuler,
  canetteProduit,
  canetteSaveurs = [],
}: QuantiteModalPubliqueProps) {
  const [quantite, setQuantite] = useState(1);
  const [prixSaisi, setPrixSaisi] = useState("");
  // Une entrée par unité choisie (doublons autorisés, ex: 2x Coca) — même
  // convention que les extras viande/sauce du configurateur Tacos.
  const [canettesChoisies, setCanettesChoisies] = useState<string[]>([]);

  function ajouterCanette(nom: string) {
    setCanettesChoisies((prec) => [...prec, nom]);
  }
  function retirerCanette(nom: string) {
    setCanettesChoisies((prec) => {
      const index = prec.lastIndexOf(nom);
      if (index === -1) return prec;
      const copie = [...prec];
      copie.splice(index, 1);
      return copie;
    });
  }

  const demandePrixLibre = produit.prix === null;
  const prixUnitaire = produit.prix ?? Number(prixSaisi.replace(",", "."));
  const prixValide = !demandePrixLibre || (Number.isFinite(prixUnitaire) && prixUnitaire > 0);
  const nbPiecesParPaquet = piecesParPaquet(produit.nom);
  // Jamais plus que le stock du jour restant, sinon le sélecteur laisse
  // croire à un stock illimité jusqu'à 20 alors qu'il en reste bien moins.
  const quantiteMax = produit.stockJour !== null ? Math.min(QUANTITE_MAX, produit.stockJour) : QUANTITE_MAX;

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
            onClick={() => setQuantite((q) => Math.min(quantiteMax, q + 1))}
            disabled={quantite >= quantiteMax}
            aria-label="Ajouter une unité"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-30"
          >
            +
          </button>
        </div>

        <p className="mt-6 text-center text-4xl font-extrabold text-[#8B2020]">
          {(
            (prixValide ? prixUnitaire * quantite : 0) + canettesChoisies.length * (canetteProduit?.prix ?? 0)
          ).toFixed(2)} €
        </p>
        {nbPiecesParPaquet > 1 && (
          <p className="mt-1 text-center text-sm text-gray-500">Soit {quantite * nbPiecesParPaquet} pièces</p>
        )}
        {produit.stockJour !== null && (
          <p className="mt-1 text-center text-xs text-gray-400">Stock du jour : {produit.stockJour} restant(s)</p>
        )}

        {canetteProduit && canetteSaveurs.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-sm font-bold text-[#C2540C]">
              + Une boisson avec ? ({(canetteProduit.prix ?? 0).toFixed(2)} € / unité)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {canetteSaveurs.map((s) => {
                const count = canettesChoisies.filter((c) => c === s.nom).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => ajouterCanette(s.nom)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      count > 0
                        ? "border-[#C2540C] bg-[#C2540C] text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {s.nom}
                    {count > 1 ? ` ×${count}` : ""}
                  </button>
                );
              })}
            </div>
            {canettesChoisies.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[...new Set(canettesChoisies)].map((nom) => (
                  <span
                    key={nom}
                    className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                  >
                    {nom} ×{canettesChoisies.filter((c) => c === nom).length}
                    <button
                      type="button"
                      onClick={() => retirerCanette(nom)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={`Retirer une unité de ${nom}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <span className="text-sm font-extrabold text-[#C2540C]">
                  = {(canettesChoisies.length * (canetteProduit.prix ?? 0)).toFixed(2)} €
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            disabled={!prixValide}
            onClick={() =>
              onValider(quantite, demandePrixLibre ? prixUnitaire : undefined, canettesChoisies)
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
