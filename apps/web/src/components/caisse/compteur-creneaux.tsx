"use client";

import { useEffect, useState } from "react";
import type { LigneCompteurCreneau } from "@/lib/commande-publique/compteur-creneaux";

export function CompteurCreneaux() {
  const [lignes, setLignes] = useState<LigneCompteurCreneau[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    const charger = () =>
      fetch("/api/caisse/compteur-creneaux", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (annule) return;
          if (Array.isArray(d.lignes)) {
            setLignes(d.lignes);
            setErreur(false);
          } else setErreur(true);
        })
        .catch(() => {
          if (!annule) setErreur(true);
        });
    charger();
    const intervalle = setInterval(charger, 30_000);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, []);

  const total = (lignes ?? []).reduce((somme, l) => somme + l.nombre, 0);
  const lieux = [...new Set((lignes ?? []).map((l) => l.lieu))];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-bold text-black">
        Livraisons du jour par créneau{lignes ? ` — ${total}` : ""}
      </h2>
      {erreur && !lignes && <p className="mt-1 text-sm text-gray-500">Chargement impossible.</p>}
      {lignes && lignes.length === 0 && <p className="mt-1 text-sm text-gray-500">Aucune livraison pour aujourd&apos;hui.</p>}
      {lieux.map((lieu) => (
        <div key={lieu} className="mt-3">
          <p className="text-sm font-bold text-gray-900">{lieu}</p>
          <ul className="mt-1 divide-y divide-gray-100">
            {(lignes ?? [])
              .filter((l) => l.lieu === lieu)
              .map((l) => (
                <li key={l.creneau} className="flex justify-between py-1 text-sm text-black">
                  <span>{l.creneau}</span>
                  <span className="font-bold">{l.nombre}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
