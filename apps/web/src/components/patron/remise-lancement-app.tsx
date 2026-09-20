"use client";

import { useState } from "react";
import { MONTANT_REMISE_LANCEMENT, SEUIL_REMISE_LANCEMENT } from "@/lib/commande-publique/remise-lancement";

interface RemiseLancementAppProps {
  debutInitial: string | null;
  finInitiale: string | null;
}

/**
 * Dates de l'opération de lancement (-2€ dès 10€, site public
 * uniquement) — même carte que EtatSiteApp/JoursFermetureApp, mais deux
 * champs date plutôt qu'une bascule. Laisser un champ vide désactive la
 * remise, jamais bloquant.
 */
export function RemiseLancementApp({ debutInitial, finInitiale }: RemiseLancementAppProps) {
  const [debut, setDebut] = useState(debutInitial ?? "");
  const [fin, setFin] = useState(finInitiale ?? "");
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function enregistrer() {
    setErreur(null);
    setSucces(false);
    setEnregistrementEnCours(true);
    try {
      const reponse = await fetch("/api/patron/remise-lancement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debut: debut || null, fin: fin || null }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la mise à jour.");
        return;
      }
      setSucces(true);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="font-semibold text-white">Remise de lancement</div>
      <p className="mt-1 text-xs text-gray-400">
        Remise automatique de {MONTANT_REMISE_LANCEMENT}€ dès {SEUIL_REMISE_LANCEMENT}€ d&apos;achat sur le site
        (jamais en caisse), entre ces deux dates incluses. Laisser vide pour désactiver.
      </p>
      {erreur && <p className="mt-1 text-xs text-orange-400">{erreur}</p>}
      {succes && <p className="mt-1 text-xs text-green-400">Enregistré.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-400">
          Début
          <input
            type="date"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
            className="mt-1 block rounded border border-gray-700 bg-gray-800 p-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-gray-400">
          Fin
          <input
            type="date"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className="mt-1 block rounded border border-gray-700 bg-gray-800 p-2 text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={enregistrer}
          disabled={enregistrementEnCours}
          className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
