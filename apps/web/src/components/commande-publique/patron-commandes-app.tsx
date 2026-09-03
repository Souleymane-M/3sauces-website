"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandeAdmin, StatutCommandePublique } from "@/lib/commande-publique/types";

const INTERVALLE_POLLING_MS = 10_000;

const LIBELLES_STATUT: Record<StatutCommandePublique, string> = {
  recue: "Reçue",
  en_preparation: "En préparation",
  livree: "Livrée",
};

const STATUT_SUIVANT: Record<StatutCommandePublique, StatutCommandePublique | null> = {
  recue: "en_preparation",
  en_preparation: "livree",
  livree: null,
};

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Indian/Mayotte",
  });
}

interface PatronCommandesAppProps {
  commandesInitiales: CommandeAdmin[];
}

/**
 * Vue admin (Page 3) : liste des commandes du site public, triée par heure
 * souhaitée, rafraîchie par polling — pas de vrai temps réel Supabase
 * possible ici (auth JWT maison, aucune policy RLS définie), voir notes de
 * conception. Suffisant pour le besoin MVP ("temps réel" perçu côté patron).
 */
export function PatronCommandesApp({ commandesInitiales }: PatronCommandesAppProps) {
  const [commandes, setCommandes] = useState<CommandeAdmin[]>(commandesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const enMiseAJour = useRef<Set<string>>(new Set());

  const rafraichir = useCallback(async () => {
    try {
      const reponse = await fetch("/api/patron/commandes", { cache: "no-store" });
      if (!reponse.ok) return;
      const data = await reponse.json();
      setCommandes(data.commandes ?? []);
      setErreur(null);
    } catch {
      setErreur("Connexion perdue — nouvel essai automatique...");
    }
  }, []);

  useEffect(() => {
    const intervalle = setInterval(rafraichir, INTERVALLE_POLLING_MS);
    return () => clearInterval(intervalle);
  }, [rafraichir]);

  async function avancerStatut(commande: CommandeAdmin) {
    const suivant = STATUT_SUIVANT[commande.statut];
    if (!suivant || enMiseAJour.current.has(commande.id)) return;

    enMiseAJour.current.add(commande.id);
    setCommandes((precedent) => precedent.map((c) => (c.id === commande.id ? { ...c, statut: suivant } : c)));

    try {
      const reponse = await fetch("/api/patron/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: commande.id, statut: suivant }),
      });
      if (!reponse.ok) {
        await rafraichir(); // resynchronise en cas d'échec
      }
    } finally {
      enMiseAJour.current.delete(commande.id);
    }
  }

  const commandesActives = commandes.filter((c) => c.statut !== "livree");
  const commandesLivrees = commandes.filter((c) => c.statut === "livree");

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Commandes du site</h2>
        <button onClick={rafraichir} className="text-xs text-gray-400 underline">
          Rafraîchir
        </button>
      </div>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      {commandesActives.length === 0 && <p className="text-sm text-gray-500">Aucune commande en cours.</p>}

      <ul className="space-y-3">
        {commandesActives.map((c) => (
          <li key={c.id} className="rounded border border-gray-700 p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">
                  {formatHeure(c.heureSouhaitee)} — {c.canal === "livraison" ? "Livraison" : "Sur place"}
                </div>
                <div className="text-sm text-gray-400">
                  {c.nom} · {c.telephone}
                </div>
                {c.canal === "livraison" && (
                  <div className="text-sm text-gray-400">
                    {c.adresse} ({c.zone})
                  </div>
                )}
              </div>
              <span className="rounded bg-gray-800 px-2 py-1 text-xs">{LIBELLES_STATUT[c.statut]}</span>
            </div>

            <ul className="mt-2 text-sm text-gray-300">
              {c.lignes.map((l, i) => (
                <li key={i}>
                  {l.quantite}× {l.nom}
                  {l.viandes.length > 0 ? ` (${l.viandes.join(", ")})` : ""}
                  {l.sauces.length > 0 ? ` — sauces : ${l.sauces.join(", ")}` : ""}
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center justify-between">
              <span className="font-semibold">{c.montant.toFixed(2)} €</span>
              {STATUT_SUIVANT[c.statut] && (
                <button
                  onClick={() => avancerStatut(c)}
                  className="rounded bg-white px-3 py-2 text-sm font-semibold text-black"
                >
                  Marquer « {LIBELLES_STATUT[STATUT_SUIVANT[c.statut]!]} »
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {commandesLivrees.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-sm text-gray-500">
            Livrées aujourd&apos;hui ({commandesLivrees.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-gray-500">
            {commandesLivrees.map((c) => (
              <li key={c.id}>
                {formatHeure(c.heureSouhaitee)} — {c.nom} — {c.montant.toFixed(2)} €
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
