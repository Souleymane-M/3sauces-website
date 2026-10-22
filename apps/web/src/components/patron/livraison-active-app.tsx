"use client";

import { useState } from "react";

interface LivraisonActiveAppProps {
  actifInitial: boolean;
}

/**
 * Interrupteur "livraison activée/désactivée" — distinct de EtatSiteApp
 * (qui coupe tout le site) : permet de couper uniquement le canal
 * livraison, par ex. si aucun livreur n'est disponible, sans toucher au
 * retrait sur place/à emporter. Bascule optimiste, même pattern que
 * EtatSiteApp.
 */
export function LivraisonActiveApp({ actifInitial }: LivraisonActiveAppProps) {
  const [actif, setActif] = useState(actifInitial);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    setErreur(null);
    const nouvelEtat = !actif;
    setActif(nouvelEtat);

    const reponse = await fetch("/api/patron/livraison", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: nouvelEtat }),
    });
    if (!reponse.ok) {
      setActif(!nouvelEtat);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${
        actif ? "border-green-700 bg-green-950/30" : "border-red-700 bg-red-950/30"
      }`}
    >
      <div>
        <div className="font-semibold text-white">{actif ? "Livraison activée" : "Livraison désactivée"}</div>
        <p className="text-xs text-gray-400">
          {actif
            ? "Les clients peuvent choisir la livraison, sur le site comme en caisse."
            : "La livraison est masquée partout — seuls sur place et à emporter restent proposés."}
        </p>
        {erreur && <p className="mt-1 text-xs text-orange-400">{erreur}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        onClick={basculer}
        className={`relative h-7 w-14 shrink-0 rounded-full transition-colors ${
          actif ? "bg-green-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
            actif ? "translate-x-7" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
