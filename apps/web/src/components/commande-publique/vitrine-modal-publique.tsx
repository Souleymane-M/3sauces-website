"use client";

import { useState } from "react";
import type { ProduitConfigurable, SaveurPublique } from "@/lib/commande-publique/types";
import { piecesParPaquet, nomSansMultiplicateur, nomPluriel } from "@/lib/pieces-produit";

const QUANTITE_MAX = 20;

/** Un produit à choix de saveur (ex: Canette 33cl, Boisson 2L) : une ligne par saveur, chacune avec son propre compteur. */
export interface ProduitAvecSaveurs {
  produit: ProduitConfigurable;
  saveurs: SaveurPublique[];
}

export interface ChoixVitrine {
  produit: ProduitConfigurable;
  quantite: number;
  saveur: string | null;
}

interface VitrineModalPubliqueProps {
  titre: string;
  sections: { titre: string; produits: ProduitConfigurable[] }[];
  produitsAvecSaveurs: ProduitAvecSaveurs[];
  onAnnuler: () => void;
  onValider: (choix: ChoixVitrine[]) => void;
}

/**
 * "Un seul rayon" : grillades, accompagnements et boissons dans une seule
 * fenêtre, chacun avec son propre compteur -/+ — le client (ou la
 * caissière) ajoute tout ce qu'il veut sans jamais fermer/rouvrir une
 * fenêtre par article. Un seul "Ajouter au panier" en bas commet tout
 * d'un coup ; le plafond de stock réel reste vérifié par le parent
 * (`ajouterAuPanier`/`plafonnerQuantite`), jamais dupliqué ici — cette
 * fenêtre ne fait que collecter des intentions de quantité.
 */
export function VitrineModalPublique({
  titre,
  sections,
  produitsAvecSaveurs,
  onAnnuler,
  onValider,
}: VitrineModalPubliqueProps) {
  // Clé = produit.id pour un article simple, `${produit.id}::${saveur}` pour un article à saveur.
  const [quantites, setQuantites] = useState<Record<string, number>>({});

  function cle(produitId: string, saveur: string | null): string {
    return saveur ? `${produitId}::${saveur}` : produitId;
  }

  function ajuster(cleItem: string, delta: number) {
    setQuantites((prec) => {
      const actuelle = prec[cleItem] ?? 0;
      const suivante = Math.max(0, Math.min(QUANTITE_MAX, actuelle + delta));
      return { ...prec, [cleItem]: suivante };
    });
  }

  const totalArticles = Object.values(quantites).reduce((total, q) => total + q, 0);

  function valider() {
    const choix: ChoixVitrine[] = [];
    for (const { produits } of sections) {
      for (const produit of produits) {
        const q = quantites[cle(produit.id, null)] ?? 0;
        if (q > 0) choix.push({ produit, quantite: q, saveur: null });
      }
    }
    for (const { produit, saveurs } of produitsAvecSaveurs) {
      for (const s of saveurs) {
        const q = quantites[cle(produit.id, s.nom)] ?? 0;
        if (q > 0) choix.push({ produit, quantite: q, saveur: s.nom });
      }
    }
    onValider(choix);
  }

  function ligneStepper(cleItem: string, label: string, prix: number, sousLigne?: string, pieces = 1) {
    const q = quantites[cleItem] ?? 0;
    // Le compteur ajuste par unité vendue (paquet), mais affiche le nombre
    // RÉEL de pièces (ex: 4 paquets de "x3" → affiche 12) pour qu'un client
    // ou une caissière pressés ne lisent jamais "4" en pensant "4 pièces"
    // quand il s'agit en réalité de 4 paquets de 3.
    const nbPieces = q * pieces;
    return (
      <div key={cleItem} className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{label}</p>
          {sousLigne && <p className="text-xs text-gray-400">{sousLigne}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {q > 0 && (
            <span className="min-w-[3.5rem] text-right text-sm font-extrabold text-[#8B2020]">
              {(prix * q).toFixed(2)} €
            </span>
          )}
          <button
            type="button"
            onClick={() => ajuster(cleItem, -1)}
            disabled={q <= 0}
            aria-label={`Retirer ${label}`}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-700 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-6 text-center text-base font-bold text-gray-900">{nbPieces}</span>
          <button
            type="button"
            onClick={() => ajuster(cleItem, 1)}
            aria-label={`Ajouter ${label}`}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg font-bold text-gray-700"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-bold text-gray-900">{titre}</h2>
          <button onClick={onAnnuler} aria-label="Fermer" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sections.map(
            (section) =>
              section.produits.length > 0 && (
                <div key={section.titre} className="mb-4">
                  <p className="mb-1 text-sm font-bold text-[#8B2020]">{section.titre}</p>
                  {section.produits.map((produit) => {
                    const pieces = piecesParPaquet(produit.nom);
                    const sousLigne =
                      `${(produit.prix ?? 0).toFixed(2)} €` + (pieces > 1 ? ` — ${nomPluriel(nomSansMultiplicateur(produit.nom).toLowerCase(), pieces)} par unité` : "");
                    return ligneStepper(cle(produit.id, null), produit.nom, produit.prix ?? 0, sousLigne, pieces);
                  })}
                </div>
              )
          )}

          {produitsAvecSaveurs.map(({ produit, saveurs }) => (
            <div key={produit.id} className="mb-4">
              <p className="mb-1 text-sm font-bold text-[#8B2020]">
                {produit.nom} <span className="font-normal text-gray-400">({(produit.prix ?? 0).toFixed(2)} €)</span>
              </p>
              {saveurs.map((s) => ligneStepper(cle(produit.id, s.nom), s.nom, produit.prix ?? 0))}
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4">
          <button
            onClick={onAnnuler}
            className="flex-1 rounded border border-gray-300 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={totalArticles === 0}
            className="flex-1 rounded bg-[#8B2020] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ajouter au panier{totalArticles > 0 ? ` (${totalArticles})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
