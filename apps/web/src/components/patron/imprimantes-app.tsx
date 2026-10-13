"use client";

import { useState } from "react";
import type { ImprimanteAdmin } from "@/lib/patron/imprimantes-types";

interface ImprimantesAppProps {
  imprimantesInitiales: ImprimanteAdmin[];
}

interface Brouillon {
  nom: string;
  directPrintToken: string;
}

function versBrouillon(i: ImprimanteAdmin): Brouillon {
  return { nom: i.nom, directPrintToken: i.directPrintToken ?? "" };
}

function estModifie(brouillon: Brouillon, i: ImprimanteAdmin): boolean {
  const reference = versBrouillon(i);
  return brouillon.nom !== reference.nom || brouillon.directPrintToken !== reference.directPrintToken;
}

/**
 * Configuration des 2 imprimantes thermiques (comptoir/cuisine) — cf.
 * lib/patron/imprimantes.ts. Contrairement à ProduitsApp/OptionsApp, ce sont
 * 2 lignes fixes créées par la migration : pas d'ajout ni de suppression
 * ici, juste éditer le nom et le jeton Server Direct Print. Depuis
 * 2026-10-13, plus besoin d'adresse IP/port/relais : l'imprimante va
 * elle-même chercher son travail, identifiée uniquement par ce jeton.
 */
export function ImprimantesApp({ imprimantesInitiales }: ImprimantesAppProps) {
  const [imprimantes, setImprimantes] = useState<ImprimanteAdmin[]>(imprimantesInitiales);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>(() =>
    Object.fromEntries(imprimantesInitiales.map((i) => [i.id, versBrouillon(i)]))
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState<string | null>(null);

  function modifierBrouillon<K extends keyof Brouillon>(id: string, champ: K, valeur: Brouillon[K]) {
    setBrouillons((precedent) => ({ ...precedent, [id]: { ...precedent[id], [champ]: valeur } }));
  }

  async function enregistrer(imprimante: ImprimanteAdmin) {
    const brouillon = brouillons[imprimante.id];
    if (!brouillon) return;

    const nom = brouillon.nom.trim();
    if (!nom) {
      setErreur("Le nom ne peut pas être vide.");
      return;
    }
    const directPrintToken = brouillon.directPrintToken.trim() || null;

    setErreur(null);
    setEnregistrementEnCours(imprimante.id);
    try {
      const reponse = await fetch("/api/patron/imprimantes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: imprimante.id, nom, directPrintToken }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      const imprimanteMiseAJour: ImprimanteAdmin = { ...imprimante, nom, directPrintToken };
      setImprimantes((precedent) => precedent.map((i) => (i.id === imprimante.id ? imprimanteMiseAJour : i)));
      setBrouillons((precedent) => ({ ...precedent, [imprimante.id]: versBrouillon(imprimanteMiseAJour) }));
    } finally {
      setEnregistrementEnCours(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Imprimantes</h2>
      <p className="text-xs text-gray-500">
        L&apos;imprimante va elle-même chercher son travail (Server Direct Print), sans dépendre d&apos;un relais ni
        d&apos;un ordinateur allumé — jamais besoin d&apos;adresse IP ici.
      </p>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      <ul className="space-y-3">
        {imprimantes.map((imprimante) => {
          const brouillon = brouillons[imprimante.id] ?? versBrouillon(imprimante);
          const modifie = estModifie(brouillon, imprimante);

          return (
            <li key={imprimante.id} className="space-y-2 rounded border border-gray-700 p-3">
              <input
                value={brouillon.nom}
                onChange={(e) => modifierBrouillon(imprimante.id, "nom", e.target.value)}
                placeholder="Nom"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />

              <div className="flex gap-2">
                <input
                  value={brouillon.directPrintToken}
                  onChange={(e) => modifierBrouillon(imprimante.id, "directPrintToken", e.target.value)}
                  placeholder="Jeton Server Direct Print"
                  className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => modifierBrouillon(imprimante.id, "directPrintToken", crypto.randomUUID())}
                  className="shrink-0 rounded border border-gray-600 px-3 text-sm text-gray-300"
                >
                  Générer
                </button>
              </div>
              {brouillon.directPrintToken && (
                <p className="rounded bg-gray-900 p-2 text-xs break-all text-gray-400">
                  À coller dans l&apos;imprimante (Services → Server Direct Print → Server1 → URL) :<br />
                  {typeof window !== "undefined" ? window.location.origin : ""}/api/print/epson/{brouillon.directPrintToken}
                </p>
              )}

              {modifie && (
                <button
                  onClick={() => enregistrer(imprimante)}
                  disabled={enregistrementEnCours === imprimante.id}
                  className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {enregistrementEnCours === imprimante.id ? "Enregistrement…" : "Enregistrer"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
