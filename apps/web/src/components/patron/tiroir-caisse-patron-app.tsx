"use client";

import { useState } from "react";
import type { JourTiroir } from "@/lib/caisse/tiroir";
import type { MouvementCaisse } from "@/lib/caisse/tiroir-types";

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });
const LIBELLES = { ouverture: "Fonds de caisse", sortie: "Sortie", cloture: "Comptage de fin de journée" } as const;

export function TiroirCaissePatronApp({ joursInitiaux }: { joursInitiaux: JourTiroir[] }) {
  const [jours, setJours] = useState(joursInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function annuler(m: MouvementCaisse) {
    if (!window.confirm(`Annuler cette ligne (${LIBELLES[m.type]} ${euros(m.montant)}) ? Elle restera visible, barrée, et pourra être ressaisie.`)) return;
    setEnCours(m.id);
    setErreur(null);
    try {
      const res = await fetch("/api/patron/tiroir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErreur(d.error ?? "Annulation impossible.");
        return;
      }
      setJours((js) => js.map((j) => ({ ...j, mouvements: j.mouvements.map((x) => (x.id === m.id ? { ...x, annule: true } : x)) })));
    } catch {
      setErreur("Annulation impossible.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-bold text-black">Tiroir-caisse — 14 derniers jours</h2>
      {erreur && <p className="mt-2 text-sm text-red-600">{erreur}</p>}
      {jours.length === 0 && <p className="mt-2 text-gray-500">Aucune saisie pour l&apos;instant.</p>}
      <div className="mt-3 space-y-4">
        {jours.map((j) => (
          <div key={j.date}>
            <p className="font-semibold text-gray-700">{j.date.split("-").reverse().join("/")}</p>
            <ul className="mt-1 divide-y divide-gray-100">
              {j.mouvements.map((m) => (
                <li key={m.id} className={`flex flex-wrap items-center justify-between gap-2 py-1 text-sm ${m.annule ? "text-gray-400 line-through" : "text-black"}`}>
                  <span>
                    {heure(m.creeLe)} — {LIBELLES[m.type]}
                    {m.motif ? ` (${m.motif})` : ""} — {m.profilNom}
                    {m.type === "cloture" && m.attendu !== null && ` · attendu ${euros(m.attendu)}, écart ${euros(m.ecart ?? 0)}`}
                  </span>
                  <span className="flex items-center gap-2">
                    <b>{euros(m.montant)}</b>
                    {!m.annule && (
                      <button
                        type="button"
                        disabled={enCours === m.id}
                        onClick={() => annuler(m)}
                        className="rounded border border-red-300 px-2 py-0.5 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
