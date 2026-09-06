"use client";

import { useState } from "react";
import type { OptionAdmin, TypeOption } from "@/lib/patron/options-types";

interface OptionsAppProps {
  viandesInitiales: OptionAdmin[];
  saucesInitiales: OptionAdmin[];
  saveursInitiales: OptionAdmin[];
}

const LIBELLES: Record<TypeOption, string> = {
  viandes: "Viandes",
  sauces: "Sauces",
  saveurs: "Saveurs (boissons)",
};

function ListeOptions({ type, optionsInitiales }: { type: TypeOption; optionsInitiales: OptionAdmin[] }) {
  const [options, setOptions] = useState<OptionAdmin[]>(optionsInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleUnite, setNouvelleUnite] = useState<"grammes" | "pieces">("pieces");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  async function basculerActif(option: OptionAdmin) {
    setErreur(null);
    const nouvelActif = !option.actif;
    setOptions((precedent) => precedent.map((o) => (o.id === option.id ? { ...o, actif: nouvelActif } : o)));

    const reponse = await fetch("/api/patron/options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id: option.id, actif: nouvelActif }),
    });
    if (!reponse.ok) {
      setOptions((precedent) => precedent.map((o) => (o.id === option.id ? { ...o, actif: option.actif } : o)));
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  async function renommer(option: OptionAdmin, nouveauNomOption: string) {
    const nom = nouveauNomOption.trim();
    if (!nom || nom === option.nom) return;

    setErreur(null);
    const reponse = await fetch("/api/patron/options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id: option.id, nom }),
    });
    if (!reponse.ok) {
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec du renommage.");
      return;
    }
    setOptions((precedent) => precedent.map((o) => (o.id === option.id ? { ...o, nom } : o)));
  }

  async function supprimer(option: OptionAdmin) {
    if (!confirm(`Supprimer définitivement « ${option.nom} » ?`)) return;
    setErreur(null);
    const precedents = options;
    setOptions((precedent) => precedent.filter((o) => o.id !== option.id));

    const reponse = await fetch("/api/patron/options", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id: option.id }),
    });
    if (!reponse.ok) {
      setOptions(precedents);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la suppression.");
    }
  }

  async function ajouter() {
    const nom = nouveauNom.trim();
    if (!nom) {
      setErreur("Indique un nom.");
      return;
    }
    setErreur(null);
    setAjoutEnCours(true);
    try {
      const reponse = await fetch("/api/patron/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, nom, uniteDeduction: type === "viandes" ? nouvelleUnite : undefined }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la création.");
        return;
      }
      const relecture = await fetch(`/api/patron/options?type=${type}`, { cache: "no-store" });
      const relectureData = await relecture.json().catch(() => ({ options: [] }));
      setOptions(relectureData.options ?? []);
      setNouveauNom("");
    } finally {
      setAjoutEnCours(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-400">{LIBELLES[type]}</h3>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}
      <ul className="space-y-2">
        {options.map((option) => (
          <li key={option.id} className="flex items-center gap-2 rounded border border-gray-700 p-2">
            <input type="checkbox" checked={option.actif} onChange={() => basculerActif(option)} />
            <input
              defaultValue={option.nom}
              onBlur={(e) => renommer(option, e.target.value)}
              className="flex-1 rounded border border-gray-600 bg-gray-900 p-1.5 text-sm text-white"
            />
            {option.uniteDeduction && (
              <span className="text-xs text-gray-500">
                {option.uniteDeduction === "grammes" ? "Grammes" : "Pièces"}
              </span>
            )}
            <button onClick={() => supprimer(option)} className="text-xs text-red-400 hover:text-red-300">
              Supprimer
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 rounded border border-dashed border-gray-700 p-2">
        <input
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          placeholder={`Nouvelle ${type === "viandes" ? "viande" : type === "sauces" ? "sauce" : "saveur"}`}
          className="flex-1 rounded border border-gray-600 bg-gray-900 p-1.5 text-sm text-white"
        />
        {type === "viandes" && (
          <select
            value={nouvelleUnite}
            onChange={(e) => setNouvelleUnite(e.target.value as "grammes" | "pieces")}
            className="rounded border border-gray-600 bg-gray-900 p-1.5 text-sm text-white"
          >
            <option value="pieces">Pièces</option>
            <option value="grammes">Grammes</option>
          </select>
        )}
        <button
          onClick={ajouter}
          disabled={ajoutEnCours}
          className="rounded bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

/**
 * Gestion des référentiels d'options (Page 3 / Module 6) : viandes,
 * sauces, saveurs — cf. lib/patron/options.ts.
 */
export function OptionsApp({ viandesInitiales, saucesInitiales, saveursInitiales }: OptionsAppProps) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Options (viandes, sauces, saveurs)</h2>
      <p className="text-xs text-gray-500">
        Ces listes alimentent les configurateurs du site public. Renommer se fait en cliquant hors du champ après
        modification ; activer/désactiver et supprimer sont immédiats.
      </p>
      <ListeOptions type="viandes" optionsInitiales={viandesInitiales} />
      <ListeOptions type="sauces" optionsInitiales={saucesInitiales} />
      <ListeOptions type="saveurs" optionsInitiales={saveursInitiales} />
    </div>
  );
}
