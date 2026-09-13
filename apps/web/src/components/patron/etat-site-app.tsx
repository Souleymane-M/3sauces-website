"use client";

import { useState } from "react";

interface EtatSiteAppProps {
  ouvertInitial: boolean;
}

/**
 * Interrupteur "site ouvert/fermé aux commandes" — en haut de /patron pour
 * rester visible immédiatement en cas d'urgence. Bascule optimiste, comme
 * `basculerActif` de ProduitsApp.
 */
export function EtatSiteApp({ ouvertInitial }: EtatSiteAppProps) {
  const [ouvert, setOuvert] = useState(ouvertInitial);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    setErreur(null);
    const nouvelEtat = !ouvert;
    setOuvert(nouvelEtat);

    const reponse = await fetch("/api/patron/site", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ouvert: nouvelEtat }),
    });
    if (!reponse.ok) {
      setOuvert(!nouvelEtat);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${
        ouvert ? "border-green-700 bg-green-950/30" : "border-red-700 bg-red-950/30"
      }`}
    >
      <div>
        <div className="font-semibold text-white">
          {ouvert ? "Site ouvert aux commandes" : "Site fermé aux commandes"}
        </div>
        <p className="text-xs text-gray-400">
          {ouvert
            ? "Les clients peuvent commander normalement sur 3sauces.fr."
            : "Le menu est masqué et toute tentative de commande est refusée."}
        </p>
        {erreur && <p className="mt-1 text-xs text-orange-400">{erreur}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ouvert}
        onClick={basculer}
        className={`relative h-7 w-14 shrink-0 rounded-full transition-colors ${
          ouvert ? "bg-green-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
            ouvert ? "translate-x-7" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
