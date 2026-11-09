"use client";

import { useState } from "react";

const MOTIFS = ["Client absent", "Adresse introuvable", "Client refuse", "Ne répond pas", "Problème de paiement"];
const AUTRE = "Autre motif";

interface Props {
  enCours: boolean;
  onAnnuler: () => void;
  onEnvoyer: (motif: string) => void;
}

/**
 * Motif d'une livraison impossible : un bouton par motif courant (précision libre facultative) et "Autre motif"
 * (texte obligatoire, faute de motif connu). Partagé entre la liste du livreur et l'écran du QR code.
 */
export function FormulaireImpossibleLivrer({ enCours, onAnnuler, onEnvoyer }: Props) {
  const [motif, setMotif] = useState<string | null>(null);
  const [precision, setPrecision] = useState("");

  const estAutre = motif === AUTRE;
  const complet = motif !== null && (!estAutre || precision.trim() !== "");

  function envoyer() {
    if (!motif) return;
    const detail = precision.trim();
    onEnvoyer(estAutre ? detail : detail ? `${motif} — ${detail}` : motif);
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-600 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-700">Pourquoi ?</p>
      <div className="grid grid-cols-2 gap-2">
        {[...MOTIFS, AUTRE].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotif(m)}
            className={`rounded border py-2 text-sm font-bold ${
              motif === m ? "border-red-600 bg-red-600 text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      {motif && (
        <input
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
          placeholder={estAutre ? "Quel motif ?" : "Précision (facultatif)"}
          className="w-full rounded border border-gray-300 p-3 text-sm text-gray-900"
        />
      )}
      <p className="text-xs text-gray-600">Un responsable sera alerté tout de suite par email.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAnnuler}
          className="flex-1 rounded border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={envoyer}
          disabled={enCours || !complet}
          className="flex-1 rounded bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Signaler"}
        </button>
      </div>
    </div>
  );
}
