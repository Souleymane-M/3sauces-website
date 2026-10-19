"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine } from "@/lib/cuisine/types";
import { formaterTelephoneAffichage } from "@/lib/telephone";
import { ConfirmationPin } from "./confirmation-pin";
import { FinServiceView } from "./fin-service-view";

const INTERVALLE_POLLING_MS = 5000;

function resumeLignes(lignes: CommandeCuisine["lignes"]): string {
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

/**
 * Vue COMPTOIR : montants et coordonnées client visibles (nécessaires
 * pour encaisser/remettre), "Remise" et "Annuler" (en attente uniquement,
 * refusé côté serveur sinon). La prise de commande (reprise de /caisse) et
 * la réconciliation des encaissements livraison restent à construire dans
 * une prochaine passe — non couvertes ici.
 */
export function ComptoirView({ profilId }: { profilId: string }) {
  const [commandes, setCommandes] = useState<CommandeCuisine[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [annulationEnAttente, setAnnulationEnAttente] = useState<string | null>(null);
  const [finServiceOuvert, setFinServiceOuvert] = useState(false);
  const enVol = useRef(false);

  async function charger() {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/equipe/comptoir/commandes");
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
    const intervalle = setInterval(charger, INTERVALLE_POLLING_MS);
    return () => clearInterval(intervalle);
  }, []);

  async function appliquer(commandeId: string, action: "remise" | "annuler") {
    setEnCours(commandeId);
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/comptoir/action", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, action, profilId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        return;
      }
      await charger();
    } finally {
      setEnCours(null);
    }
  }

  if (finServiceOuvert) {
    return <FinServiceView profilId={profilId} onFermer={() => setFinServiceOuvert(false)} />;
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setFinServiceOuvert(true)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
        >
          Fin de service
        </button>
      </div>
      {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}
      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-black">
                  #{String(c.numero).padStart(4, "0")} — {c.nom}
                </p>
                <p className="text-sm text-gray-700">{resumeLignes(c.lignes)}</p>
                {c.telephone && <p className="text-sm text-gray-500">{formaterTelephoneAffichage(c.telephone)}</p>}
                {c.adresse && <p className="text-sm text-gray-500">{c.adresse}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-black">{c.montant.toFixed(2)} €</p>
                <p className="text-xs text-gray-500">{c.statut === "pret" ? "Prête" : c.statut}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              {c.statut === "pret" && c.canal !== "livraison" && (
                <button
                  type="button"
                  onClick={() => appliquer(c.id, "remise")}
                  disabled={enCours === c.id}
                  className="rounded bg-[#2D5A27] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Remise
                </button>
              )}
              {c.statut === "en_attente" && (
                <button
                  type="button"
                  onClick={() => setAnnulationEnAttente(c.id)}
                  disabled={enCours === c.id}
                  className="rounded border border-red-600 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        ))}
        {commandes.length === 0 && <p className="text-center text-gray-500">Aucune commande active.</p>}
      </div>

      {annulationEnAttente && (
        <ConfirmationPin
          titre="Confirmer l'annulation"
          onAnnule={() => setAnnulationEnAttente(null)}
          onConfirme={() => {
            const id = annulationEnAttente;
            setAnnulationEnAttente(null);
            appliquer(id, "annuler");
          }}
        />
      )}
    </div>
  );
}
