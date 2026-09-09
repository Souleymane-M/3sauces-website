"use client";

import { useState } from "react";

const LONGUEUR_MAX = 6;

/**
 * Identification légère "qui agit en ce moment" sur l'iPad partagé de
 * /commandes — distincte du PinPad de connexion (apps/web/src/components/auth/pin-pad.tsx)
 * utilisé pour /caisse et /livreur : ici pas de cookie, juste un aller-retour
 * vers /api/cuisine/identifier dont le résultat est géré par le parent
 * (commandes-app.tsx, sessionStorage + minuteur d'inactivité).
 */
export function IdentificationModal({
  onValide,
  onAnnuler,
}: {
  onValide: (identite: { profilId: string; nom: string }) => void;
  onAnnuler: () => void;
}) {
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(pinSaisi: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/cuisine/identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinSaisi }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Code incorrect.");
        setPin("");
        return;
      }
      onValide({ profilId: data.profilId, nom: data.nom });
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
    setPin((prev) => prev + chiffre);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-black">Qui êtes-vous ?</h2>
        <p className="text-center text-sm text-gray-500">Entre ton code personnel pour valider l&apos;action.</p>

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
              className="h-14 w-14 rounded-full border text-xl font-semibold text-black active:bg-gray-100 disabled:opacity-50"
            >
              {chiffre}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin((prev) => prev.slice(0, -1))}
            disabled={enCours || pin.length === 0}
            className="h-14 w-14 rounded-full text-sm font-medium text-gray-500 disabled:opacity-30"
          >
            Effacer
          </button>
          <button
            type="button"
            onClick={() => appuyer("0")}
            disabled={enCours}
            className="h-14 w-14 rounded-full border text-xl font-semibold text-black active:bg-gray-100 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => valider(pin)}
            disabled={enCours || pin.length < 4}
            className="h-14 w-14 rounded-full bg-[#8B2020] text-sm font-medium text-white disabled:opacity-30"
          >
            OK
          </button>
        </div>

        <button type="button" onClick={onAnnuler} className="text-sm text-gray-500 underline">
          Annuler
        </button>
      </div>
    </div>
  );
}
