"use client";

import { useState } from "react";
import { LIMITE_MESSAGE_MOMENT } from "@/lib/patron/message-moment-constants";

interface MessageMomentAppProps {
  texteInitial: string | null;
  actifInitial: boolean;
}

/**
 * Message imprimé sur les reçus clients (jamais le bon de cuisine), un seul
 * à la fois — même carte que EtatSiteApp/RemiseLancementApp. Inactif ou vide
 * = aucune ligne imprimée, jamais un vide laissé sur le ticket.
 */
export function MessageMomentApp({ texteInitial, actifInitial }: MessageMomentAppProps) {
  const [texte, setTexte] = useState(texteInitial ?? "");
  const [actif, setActif] = useState(actifInitial);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function enregistrer() {
    setErreur(null);
    setSucces(false);
    setEnregistrementEnCours(true);
    try {
      const reponse = await fetch("/api/patron/message-moment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte, actif }),
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

  const depassement = texte.length > LIMITE_MESSAGE_MOMENT;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-white">Message du moment sur les tickets</div>
        <button
          type="button"
          role="switch"
          aria-checked={actif}
          onClick={() => setActif((a) => !a)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${actif ? "bg-green-600" : "bg-gray-600"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              actif ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Imprimé sur les reçus clients uniquement (jamais le bon de cuisine). Inactif ou vide = rien n&apos;est imprimé.
      </p>
      {erreur && <p className="mt-1 text-xs text-orange-400">{erreur}</p>}
      {succes && <p className="mt-1 text-xs text-green-400">Enregistré.</p>}
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={2}
        className="mt-3 w-full rounded border border-gray-700 bg-gray-800 p-2 text-sm text-white"
        placeholder="Ex: Fermeture exceptionnelle le 25/12."
      />
      <div className="mt-1 flex items-center justify-between">
        <span className={`text-xs ${depassement ? "text-orange-400" : "text-gray-500"}`}>
          {texte.length}/{LIMITE_MESSAGE_MOMENT}
        </span>
        <button
          type="button"
          onClick={enregistrer}
          disabled={enregistrementEnCours || depassement}
          className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
