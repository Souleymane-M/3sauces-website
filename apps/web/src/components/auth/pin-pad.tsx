"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LONGUEUR_MAX = 6;

export function PinPad({ role, titre }: { role: "employe" | "livreur"; titre: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(pinSaisi: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinSaisi, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Code incorrect.");
        setPin("");
        return;
      }
      router.refresh();
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

  function effacer() {
    setErreur(null);
    setPin((prev) => prev.slice(0, -1));
  }

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-6">
      <h1 className="text-xl font-bold">{titre}</h1>

      <div className="flex gap-3" aria-live="polite">
        {Array.from({ length: LONGUEUR_MAX }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border ${
              i < pin.length ? "bg-black border-black" : "border-gray-400"
            }`}
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
            className="h-16 w-16 rounded-full border text-xl font-semibold active:bg-gray-100 disabled:opacity-50"
          >
            {chiffre}
          </button>
        ))}
        <button
          type="button"
          onClick={effacer}
          disabled={enCours || pin.length === 0}
          className="h-16 w-16 rounded-full text-sm font-medium text-gray-500 disabled:opacity-30"
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={() => appuyer("0")}
          disabled={enCours}
          className="h-16 w-16 rounded-full border text-xl font-semibold active:bg-gray-100 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => valider(pin)}
          disabled={enCours || pin.length < 4}
          className="h-16 w-16 rounded-full bg-black text-sm font-medium text-white disabled:opacity-30"
        >
          Valider
        </button>
      </div>
    </div>
  );
}
