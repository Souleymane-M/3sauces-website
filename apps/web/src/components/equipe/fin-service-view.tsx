"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine } from "@/lib/cuisine/types";
import { ConfirmationPin } from "./confirmation-pin";

const LIBELLES_MOTIF: Record<string, string> = {
  no_show: "Client non venu (no-show)",
  erreur: "Erreur",
  annulation: "Annulation",
  client_injoignable: "Client injoignable",
};

function resumeLignes(lignes: CommandeCuisine["lignes"]): string {
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

/**
 * Écran "Fin de service" (demande explicite du patron, 2026-10-19) :
 * toute commande non clôturée doit l'être avec un motif structuré, pour
 * comprendre où ça coince — jamais pour pointer quelqu'un du doigt.
 */
export function FinServiceView({ profilId, onFermer }: { profilId: string; onFermer: () => void }) {
  const [commandes, setCommandes] = useState<CommandeCuisine[] | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmationPour, setConfirmationPour] = useState<string | null>(null);
  const enVol = useRef(false);

  async function charger() {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/equipe/comptoir/fin-service");
      if (res.ok) {
        const data = await res.json();
        setCommandes(data.commandes);
      }
    } finally {
      enVol.current = false;
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function cloturer(commandeId: string) {
    const motif = motifs[commandeId];
    if (!motif) return;
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/comptoir/fin-service", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, motif, profilId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        return;
      }
      await charger();
    } catch {
      setErreur("Connexion impossible, réessaie.");
    }
  }

  if (commandes === null) {
    return <p className="mt-4 text-center text-gray-500">Chargement…</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-black">
          Fin de service — {commandes.length} commande{commandes.length > 1 ? "s" : ""} non clôturée
          {commandes.length > 1 ? "s" : ""}
        </h2>
        <button type="button" onClick={onFermer} className="text-sm text-gray-500 underline">
          ← Retour
        </button>
      </div>
      <p className="mt-1 text-sm italic text-gray-500">
        Ces chiffres servent à comprendre le fonctionnement, pas à sanctionner personne.
      </p>

      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

      {commandes.length === 0 && <p className="mt-6 text-center text-[#2D5A27] font-semibold">Tout est clôturé.</p>}

      <div className="mt-4 space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-200 p-3">
            <p className="font-bold text-black">
              #{String(c.numero).padStart(4, "0")} — {c.nom}
            </p>
            <p className="text-sm text-gray-700">{resumeLignes(c.lignes)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={motifs[c.id] ?? ""}
                onChange={(e) => setMotifs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Motif de clôture…</option>
                {Object.entries(LIBELLES_MOTIF).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setConfirmationPour(c.id)}
                disabled={!motifs[c.id]}
                className="rounded bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Clôturer
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmationPour && (
        <ConfirmationPin
          titre="Confirmer la clôture"
          onAnnule={() => setConfirmationPour(null)}
          onConfirme={() => {
            const id = confirmationPour;
            setConfirmationPour(null);
            cloturer(id);
          }}
        />
      )}
    </div>
  );
}
