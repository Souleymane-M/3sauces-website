"use client";

import { useState } from "react";
import type { ImprimanteAdmin } from "@/lib/patron/imprimantes-types";

interface ImprimantesAppProps {
  imprimantesInitiales: ImprimanteAdmin[];
}

interface Brouillon {
  nom: string;
  adresseIp: string;
  port: string;
}

function versBrouillon(i: ImprimanteAdmin): Brouillon {
  return { nom: i.nom, adresseIp: i.adresseIp ?? "", port: String(i.port) };
}

function estModifie(brouillon: Brouillon, i: ImprimanteAdmin): boolean {
  const reference = versBrouillon(i);
  return brouillon.nom !== reference.nom || brouillon.adresseIp !== reference.adresseIp || brouillon.port !== reference.port;
}

/**
 * Configuration des 2 imprimantes thermiques (comptoir/cuisine) — cf.
 * lib/patron/imprimantes.ts. Contrairement à ProduitsApp/OptionsApp, ce sont
 * 2 lignes fixes créées par la migration : pas d'ajout ni de suppression
 * ici, juste éditer nom/adresse IP/port.
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
    const port = Number(brouillon.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setErreur("Port invalide (1 à 65535).");
      return;
    }
    const adresseIp = brouillon.adresseIp.trim() || null;
    if (adresseIp && !/^(\d{1,3}\.){3}\d{1,3}$/.test(adresseIp)) {
      setErreur("Adresse IP invalide (ex: 192.168.1.50).");
      return;
    }

    setErreur(null);
    setEnregistrementEnCours(imprimante.id);
    try {
      const reponse = await fetch("/api/patron/imprimantes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: imprimante.id, nom, adresseIp, port }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      const imprimanteMiseAJour: ImprimanteAdmin = { ...imprimante, nom, adresseIp, port };
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
        Adresse IP visible dans le menu réseau de l&apos;imprimante Epson TM-m30 (ou sur un ticket de test réseau).
        Laisser l&apos;adresse IP vide désactive l&apos;impression pour cette imprimante, sans bloquer les commandes.
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
              <input
                value={brouillon.adresseIp}
                onChange={(e) => modifierBrouillon(imprimante.id, "adresseIp", e.target.value)}
                placeholder="Adresse IP (ex: 192.168.1.50)"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />
              <input
                value={brouillon.port}
                onChange={(e) => modifierBrouillon(imprimante.id, "port", e.target.value)}
                placeholder="Port"
                inputMode="numeric"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />

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
