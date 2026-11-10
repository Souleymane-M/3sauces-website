"use client";

import { useState } from "react";
import type { ModePaiement } from "@3sauces/supabase";
import { nomSansMultiplicateur } from "@/lib/pieces-produit";

interface Props {
  montantDu: number;
  lignes: { nom: string; quantite: number }[];
  enCours: boolean;
  onAnnuler: () => void;
  onValider: (paiements: { mode: ModePaiement; montant: number }[], motif: string, platsNonRecuperes: string[]) => void;
}

const versNombre = (texte: string) => {
  const n = Number(texte.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Paiement partiel à la livraison : un client est parti sans payer, on n'encaisse que ce qui a été reçu (espèces, carte ou les deux). Partagé entre la liste du livreur et l'écran du QR code. */
export function FormulairePaiementPartiel({ montantDu, lignes, enCours, onAnnuler, onValider }: Props) {
  const [especes, setEspeces] = useState("");
  const [carte, setCarte] = useState("");
  const [motif, setMotif] = useState("");
  const [plats, setPlats] = useState<string[]>([]);

  const montantEspeces = versNombre(especes);
  const montantCarte = versNombre(carte);
  const recu = Math.round((montantEspeces + montantCarte) * 100) / 100;
  const montantOk = recu > 0 && recu < montantDu;
  const valide = montantOk && motif.trim() !== "";

  function valider() {
    const paiements: { mode: ModePaiement; montant: number }[] = [];
    if (montantEspeces > 0) paiements.push({ mode: "especes", montant: montantEspeces });
    if (montantCarte > 0) paiements.push({ mode: "cb", montant: montantCarte });
    onValider(paiements, motif.trim(), plats);
  }

  return (
    <div className="space-y-2 rounded-lg border border-orange-500 bg-orange-50 p-3">
      <p className="text-sm font-semibold text-orange-800">Paiement partiel — montant dû : {montantDu.toFixed(2)} €</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={especes}
          onChange={(e) => setEspeces(e.target.value)}
          inputMode="decimal"
          placeholder="Espèces reçues"
          className="w-full rounded border border-gray-300 bg-white p-3 text-lg text-gray-900"
        />
        <input
          value={carte}
          onChange={(e) => setCarte(e.target.value)}
          inputMode="decimal"
          placeholder="Carte reçue"
          className="w-full rounded border border-gray-300 bg-white p-3 text-lg text-gray-900"
        />
      </div>
      {recu > 0 && (
        <p className={`text-sm font-semibold ${montantOk ? "text-orange-800" : "text-red-600"}`}>
          {montantOk ? `Reçu ${recu.toFixed(2)} € — reste non payé : ${(montantDu - recu).toFixed(2)} €` : "Le montant reçu doit être inférieur au montant dû."}
        </p>
      )}
      {lignes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-orange-800">Plat non récupéré (facultatif)</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {lignes.map((l, i) => {
              const libelle = `${l.quantite}x ${nomSansMultiplicateur(l.nom)}`;
              const actif = plats.includes(libelle);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPlats((prec) => (actif ? prec.filter((p) => p !== libelle) : [...prec, libelle]))}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    actif ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  {libelle}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <input
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        placeholder="Motif (obligatoire) : cliente partie…"
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
          onClick={valider}
          disabled={enCours || !valide}
          className="flex-1 rounded bg-[#8B2020] py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Valider"}
        </button>
      </div>
    </div>
  );
}
