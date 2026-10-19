"use client";

import { useState } from "react";

const LONGUEUR_MAX = 6;

/**
 * Re-confirmation du PIN pour une action sensible (annulation, clôture,
 * encaissement) même si la session appareil est active — demande
 * explicite du patron, 2026-10-19. Vérifie uniquement le PIN de la
 * personne déjà connectée (cf. /api/auth/confirmer-pin), ne change rien
 * à la session en cours.
 */
export function ConfirmationPin({
  titre,
  onConfirme,
  onAnnule,
}: {
  titre: string;
  onConfirme: () => void;
  onAnnule: () => void;
}) {
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(pinSaisi: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/auth/confirmer-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinSaisi }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Code incorrect.");
        setPin("");
        return;
      }
      onConfirme();
    } catch {
      setErreur("Connexion impossible, réessaie.");
      setPin("");
    } finally {
      setEnCours(false);
    }
  }

  function appuyer(chiffre: string) {
    if (enCours || pin.length >= LONGUEUR_MAX) return;
    setErreur(null);
    const suivant = pin + chiffre;
    setPin(suivant);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-lg bg-white p-6">
        <h2 className="text-center text-lg font-bold text-gray-900">{titre}</h2>
        <p className="text-center text-sm text-gray-600">Confirme ton code PIN pour continuer.</p>

        <div className="flex gap-3" aria-live="polite">
          {Array.from({ length: LONGUEUR_MAX }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full border ${i < pin.length ? "border-black bg-black" : "border-gray-400"}`}
            />
          ))}
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((chiffre) => (
            <button
              key={chiffre}
              type="button"
              onClick={() => appuyer(chiffre)}
              disabled={enCours}
              className="h-14 w-14 rounded-full border border-gray-300 text-lg font-semibold text-gray-900 active:bg-gray-100 disabled:opacity-50"
            >
              {chiffre}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={enCours || pin.length === 0}
            className="h-14 w-14 rounded-full text-sm font-medium text-gray-500 disabled:opacity-30"
          >
            Effacer
          </button>
          <button
            type="button"
            onClick={() => appuyer("0")}
            disabled={enCours}
            className="h-14 w-14 rounded-full border border-gray-300 text-lg font-semibold text-gray-900 active:bg-gray-100 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => valider(pin)}
            disabled={enCours || pin.length < 4}
            className="h-14 w-14 rounded-full bg-black text-xs font-medium text-white disabled:opacity-30"
          >
            Valider
          </button>
        </div>

        <button type="button" onClick={onAnnule} className="text-sm text-gray-500 underline">
          Annuler
        </button>
      </div>
    </div>
  );
}
