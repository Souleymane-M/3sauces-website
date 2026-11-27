"use client";

import { useEffect, useState } from "react";
import type { EtatAudience, LigneRepartition, PeriodeAudience } from "@/lib/suivi/audience-types";

const PERIODES: { cle: PeriodeAudience; libelle: string }[] = [
  { cle: "aujourdhui", libelle: "Aujourd'hui" },
  { cle: "7j", libelle: "7 jours" },
  { cle: "30j", libelle: "30 jours" },
];

function temps(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")} s`;
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)} %` : "—";
}

function Repartition({ titre, lignes }: { titre: string; lignes: LigneRepartition[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-bold text-black">{titre}</h2>
      {lignes.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">Pas encore de données.</p>
      ) : (
        <table className="mt-2 w-full text-sm text-black">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1 font-medium">&nbsp;</th>
              <th className="py-1 text-right font-medium">Visites</th>
              <th className="py-1 text-right font-medium">Commandes</th>
              <th className="py-1 text-right font-medium">Taux</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => (
              <tr key={l.libelle}>
                <td className="py-1 pr-2">{l.libelle}</td>
                <td className="py-1 text-right">{l.visites}</td>
                <td className="py-1 text-right">{l.commandes}</td>
                <td className="py-1 text-right text-gray-600">{pct(l.commandes, l.visites)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AudienceSiteApp() {
  const [periode, setPeriode] = useState<PeriodeAudience>("aujourdhui");
  const [etat, setEtat] = useState<EtatAudience | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setEtat(null);
    fetch(`/api/patron/audience?periode=${periode}`, { cache: "no-store" })
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
    return () => {
      annule = true;
    };
  }, [periode]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            type="button"
            onClick={() => setPeriode(p.cle)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${periode === p.cle ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 bg-white text-gray-700"}`}
          >
            {p.libelle}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Mesure anonyme du site 3sauces.fr (aucun nom, téléphone, email ni adresse IP). Les mesures détaillées ont commencé le 27/11/2026 ; les données sont effacées après 90 jours. Avec peu de visiteurs, regarde plutôt la vue 7 ou 30 jours.
      </p>
      {!etat ? (
        <p className="text-gray-500">{erreur ?? "Chargement…"}</p>
      ) : (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-bold text-black">Visites depuis le {etat.depuis.split("-").reverse().join("/")}</h2>
            <p className="mt-1 text-2xl font-extrabold text-black">
              {etat.visites} <span className="text-base font-semibold text-gray-600">visites, dont {etat.visitesAvecCommande} ont commandé ({pct(etat.visitesAvecCommande, etat.visites)})</span>
            </p>
          </section>
          <Repartition titre="D'où viennent les visiteurs" lignes={etat.provenance} />
          <Repartition titre="Système" lignes={etat.systemes} />
          <Repartition titre="Type d'appareil" lignes={etat.appareils} />
          <Repartition titre="Navigateur" lignes={etat.navigateurs} />

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-bold text-black">Ce qu'ils cliquent le plus</h2>
            {etat.clics.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">Pas encore de données.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {etat.clics.map((c) => (
                  <li key={c.cible} className="flex justify-between py-1 text-sm text-black">
                    <span>{c.cible}</span>
                    <span>
                      <b>{c.clics}</b> <span className="text-gray-500">clics · {c.visiteurs} visiteur{c.visiteurs > 1 ? "s" : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-bold text-black">Produits regardés</h2>
            <p className="text-xs text-gray-500">« Vus » = visiteurs qui ont ouvert la fiche ; « Ajoutés » = visiteurs qui l&apos;ont mis au panier.</p>
            {etat.produits.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">Pas encore de données.</p>
            ) : (
              <table className="mt-2 w-full text-sm text-black">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 font-medium">Produit</th>
                    <th className="py-1 text-right font-medium">Vus</th>
                    <th className="py-1 text-right font-medium">Ajoutés</th>
                    <th className="py-1 text-right font-medium">Temps moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {etat.produits.map((p) => (
                    <tr key={p.produit}>
                      <td className="py-1 pr-2">{p.produit}</td>
                      <td className="py-1 text-right">{p.vus}</td>
                      <td className="py-1 text-right">{p.ajoutes}</td>
                      <td className="py-1 text-right text-gray-600">{temps(p.tempsMoyenSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-bold text-black">Temps passé par étape</h2>
            {etat.tempsEtapes.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">Pas encore de données.</p>
            ) : (
              <table className="mt-2 w-full text-sm text-black">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 font-medium">Étape</th>
                    <th className="py-1 text-right font-medium">Moyenne</th>
                    <th className="py-1 text-right font-medium">Médiane</th>
                    <th className="py-1 text-right font-medium">Mesures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {etat.tempsEtapes.map((t) => (
                    <tr key={t.etape}>
                      <td className="py-1 pr-2">{t.etape}</td>
                      <td className="py-1 text-right">{temps(t.tempsMoyenSec)}</td>
                      <td className="py-1 text-right">{temps(t.tempsMedianSec)}</td>
                      <td className="py-1 text-right text-gray-600">{t.mesures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
