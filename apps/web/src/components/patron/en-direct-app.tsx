"use client";

import { useEffect, useState } from "react";
import { LIBELLES_ETAPES, type EtatSuivi, type TypeEvenement } from "@/lib/suivi/types";

const ETAPES_ENTONNOIR: { type: TypeEvenement; libelle: string }[] = [
  { type: "visite", libelle: "Visites" },
  { type: "mode_choisi", libelle: "Ont choisi simple ou groupée" },
  { type: "ajout_panier", libelle: "Ont mis un plat au panier" },
  { type: "commande_validee", libelle: "Ont validé leur commande" },
];

function duree(sec: number): string {
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} min`;
}

export function EnDirectApp() {
  const [etat, setEtat] = useState<EtatSuivi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    const charger = () =>
      fetch("/api/patron/suivi", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (annule) return;
          if (d.etat) {
            setEtat(d.etat);
            setErreur(null);
          } else setErreur(d.error ?? "Chargement impossible.");
        })
        .catch(() => {
          if (!annule) setErreur("Chargement impossible.");
        });
    charger();
    const intervalle = setInterval(charger, 10_000);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, []);

  if (!etat) return <p className="text-gray-500">{erreur ?? "Chargement…"}</p>;

  const visitesAujourdhui = etat.entonnoir.aujourdhui.visite;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold text-black">
          <span className="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
          {etat.enLigne.length} personne{etat.enLigne.length > 1 ? "s" : ""} sur le site en ce moment
        </h2>
        {etat.enLigne.length === 0 && <p className="mt-1 text-sm text-gray-500">Personne pour l&apos;instant.</p>}
        <ul className="mt-2 divide-y divide-gray-100">
          {etat.enLigne.map((v, i) => (
            <li key={i} className="flex justify-between gap-2 py-1 text-sm text-black">
              <span>{LIBELLES_ETAPES[v.etape]}</span>
              <span className="text-gray-500">depuis {duree(v.depuisSec)}</span>
            </li>
          ))}
        </ul>
        {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold text-black">Où les clients abandonnent</h2>
        <p className="text-xs text-gray-500">Visiteurs différents, aujourd&apos;hui (hier entre parenthèses).</p>
        <ul className="mt-2 space-y-2">
          {ETAPES_ENTONNOIR.map(({ type, libelle }) => {
            const n = etat.entonnoir.aujourdhui[type];
            const pct = visitesAujourdhui > 0 ? Math.round((n / visitesAujourdhui) * 100) : 0;
            return (
              <li key={type}>
                <div className="flex justify-between text-sm text-black">
                  <span>{libelle}</span>
                  <span>
                    <b>{n}</b> <span className="text-gray-500">({etat.entonnoir.hier[type]} hier)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-gray-100">
                  <div className="h-2 rounded bg-[#8B2020]" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold text-black">Plats les plus ajoutés au panier aujourd&apos;hui</h2>
        {etat.topProduits.length === 0 && <p className="mt-1 text-sm text-gray-500">Rien pour l&apos;instant.</p>}
        <ul className="mt-2 divide-y divide-gray-100">
          {etat.topProduits.map((p) => (
            <li key={p.produit} className="flex justify-between py-1 text-sm text-black">
              <span>{p.produit}</span>
              <b>{p.visiteurs}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
