"use client";

import { useState } from "react";
import type { ModePaiement } from "@3sauces/supabase";

interface Props {
  montantDu: number;
  enCours: boolean;
  onAnnuler: () => void;
  onValider: (paiements: { mode: ModePaiement; montant: number }[], motif: string) => void;
}

/** Paiement partiel à la livraison : un client est parti sans payer, on n'encaisse que ce qui a été reçu. Partagé entre la liste du livreur et l'écran du QR code. */
export function FormulairePaiementPartiel({ montantDu, enCours, onAnnuler, onValider }: Props) {
  const [mode, setMode] = useState<ModePaiement>("especes");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");

  const recu = Number(montant.replace(",", "."));
  const valide = Number.isFinite(recu) && recu > 0 && recu < montantDu;

  return (
    <div className="space-y-2 rounded-lg border border-orange-500 bg-orange-50 p-3">
      <p className="text-sm font-semibold text-orange-800">Paiement partiel — montant dû : {montantDu.toFixed(2)} €</p>
      <div className="grid grid-cols-2 gap-2">
        {(["especes", "cb"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded border py-2 text-sm font-bold uppercase ${
              mode === m ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {m === "especes" ? "Espèces" : "Carte"}
          </button>
        ))}
      </div>
      <input
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
        inputMode="decimal"
        placeholder="Montant reçu"
        className="w-full rounded border border-gray-300 bg-white p-3 text-lg text-gray-900"
      />
      {valide && <p className="text-sm font-semibold text-orange-800">Reste non payé : {(montantDu - recu).toFixed(2)} €</p>}
      <input
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        placeholder="Motif (facultatif) : cliente partie…"
        className="w-full rounded border border-gray-300 bg-white p-3 text-sm text-gray-900"
      />
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
          onClick={() => onValider([{ mode, montant: recu }], motif.trim())}
          disabled={enCours || !valide}
          className="flex-1 rounded bg-[#8B2020] py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Valider"}
        </button>
      </div>
    </div>
  );
}
