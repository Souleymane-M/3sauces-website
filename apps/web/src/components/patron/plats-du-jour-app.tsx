"use client";

import { useState } from "react";
import type { PlatDuJourAdmin } from "@/lib/patron/plats-du-jour";

interface PlatsDuJourAppProps {
  platsInitiaux: PlatDuJourAdmin[];
}

interface BrouillonPlat {
  nom: string;
  description: string;
  prix: string;
}

function versBrouillon(plat: PlatDuJourAdmin): BrouillonPlat {
  return {
    nom: plat.nom,
    description: plat.description ?? "",
    prix: plat.prix !== null ? String(plat.prix) : "",
  };
}

/**
 * Gestion des Plats du jour (Page 3 / Module 6) : contrairement aux autres
 * produits (créés une fois par migration), ceux-ci sont pensés pour être
 * ajoutés/modifiés/activés au jour le jour par le patron lui-même, sans
 * jamais toucher au code — cf. lib/patron/plats-du-jour.ts.
 */
export function PlatsDuJourApp({ platsInitiaux }: PlatsDuJourAppProps) {
  const [plats, setPlats] = useState<PlatDuJourAdmin[]>(platsInitiaux);
  const [brouillons, setBrouillons] = useState<Record<string, BrouillonPlat>>(() =>
    Object.fromEntries(platsInitiaux.map((p) => [p.id, versBrouillon(p)]))
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState<string | null>(null);

  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleDescription, setNouvelleDescription] = useState("");
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  function modifierBrouillon(id: string, champ: keyof BrouillonPlat, valeur: string) {
    setBrouillons((precedent) => ({ ...precedent, [id]: { ...precedent[id], [champ]: valeur } }));
  }

  async function basculerActif(plat: PlatDuJourAdmin) {
    setErreur(null);
    const nouvelActif = !plat.actif;
    setPlats((precedent) => precedent.map((p) => (p.id === plat.id ? { ...p, actif: nouvelActif } : p)));

    const reponse = await fetch("/api/patron/plats-du-jour", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plat.id, actif: nouvelActif }),
    });
    if (!reponse.ok) {
      setPlats((precedent) => precedent.map((p) => (p.id === plat.id ? { ...p, actif: plat.actif } : p)));
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  async function enregistrerChamps(plat: PlatDuJourAdmin) {
    const brouillon = brouillons[plat.id];
    if (!brouillon) return;

    const nom = brouillon.nom.trim();
    if (!nom) {
      setErreur("Le nom ne peut pas être vide.");
      return;
    }
    const prix = Number(brouillon.prix.replace(",", "."));
    if (!Number.isFinite(prix) || prix < 0) {
      setErreur("Prix invalide.");
      return;
    }

    setErreur(null);
    setEnregistrementEnCours(plat.id);
    try {
      const reponse = await fetch("/api/patron/plats-du-jour", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plat.id, nom, description: brouillon.description.trim() || null, prix }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      setPlats((precedent) =>
        precedent.map((p) => (p.id === plat.id ? { ...p, nom, description: brouillon.description.trim() || null, prix } : p))
      );
    } finally {
      setEnregistrementEnCours(null);
    }
  }

  async function supprimer(plat: PlatDuJourAdmin) {
    if (!confirm(`Supprimer définitivement « ${plat.nom} » ?`)) return;
    setErreur(null);
    const precedents = plats;
    setPlats((precedent) => precedent.filter((p) => p.id !== plat.id));

    const reponse = await fetch("/api/patron/plats-du-jour", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plat.id }),
    });
    if (!reponse.ok) {
      setPlats(precedents);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la suppression.");
    }
  }

  async function ajouterPlat() {
    const nom = nouveauNom.trim();
    if (!nom) {
      setErreur("Indique un nom pour le nouveau plat.");
      return;
    }
    const prix = Number(nouveauPrix.replace(",", "."));
    if (!Number.isFinite(prix) || prix < 0) {
      setErreur("Prix invalide.");
      return;
    }

    setErreur(null);
    setAjoutEnCours(true);
    try {
      const reponse = await fetch("/api/patron/plats-du-jour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, description: nouvelleDescription.trim() || null, prix }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la création.");
        return;
      }
      // Pas d'id renvoyé par l'API : on recharge la liste complète, plus
      // simple et fiable que de deviner l'id généré côté base.
      const relecture = await fetch("/api/patron/plats-du-jour", { cache: "no-store" });
      const relectureData = await relecture.json().catch(() => ({ plats: [] }));
      const nouveauxPlats: PlatDuJourAdmin[] = relectureData.plats ?? [];
      setPlats(nouveauxPlats);
      setBrouillons(Object.fromEntries(nouveauxPlats.map((p) => [p.id, versBrouillon(p)])));
      setNouveauNom("");
      setNouvelleDescription("");
      setNouveauPrix("");
    } finally {
      setAjoutEnCours(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Plats du jour</h2>
      <p className="text-xs text-gray-500">
        Ces plats s&apos;affichent sur le site (section &laquo; Plats du jour &raquo;) uniquement quand ils sont
        actifs. Coche/décoche pour les activer ou désactiver au jour le jour.
      </p>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      <ul className="space-y-3">
        {plats.map((plat) => {
          const brouillon = brouillons[plat.id] ?? versBrouillon(plat);
          const modifie =
            brouillon.nom !== plat.nom ||
            brouillon.description !== (plat.description ?? "") ||
            brouillon.prix !== (plat.prix !== null ? String(plat.prix) : "");

          return (
            <li key={plat.id} className="space-y-2 rounded border border-gray-700 p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={plat.actif} onChange={() => basculerActif(plat)} />
                  {plat.actif ? "Actif" : "Inactif"}
                </label>
                <button onClick={() => supprimer(plat)} className="text-xs text-red-400 hover:text-red-300">
                  Supprimer
                </button>
              </div>

              <input
                value={brouillon.nom}
                onChange={(e) => modifierBrouillon(plat.id, "nom", e.target.value)}
                placeholder="Nom du plat"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />
              <input
                value={brouillon.description}
                onChange={(e) => modifierBrouillon(plat.id, "description", e.target.value)}
                placeholder="Description courte (optionnel)"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />
              <input
                value={brouillon.prix}
                onChange={(e) => modifierBrouillon(plat.id, "prix", e.target.value)}
                placeholder="Prix en €"
                inputMode="decimal"
                className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
              />

              {modifie && (
                <button
                  onClick={() => enregistrerChamps(plat)}
                  disabled={enregistrementEnCours === plat.id}
                  className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {enregistrementEnCours === plat.id ? "Enregistrement…" : "Enregistrer"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 rounded border border-gray-700 border-dashed p-3">
        <p className="text-sm font-semibold">Ajouter un nouveau plat</p>
        <input
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          placeholder="Nom du plat (ex: Kangué)"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <input
          value={nouvelleDescription}
          onChange={(e) => setNouvelleDescription(e.target.value)}
          placeholder="Description courte (optionnel)"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <input
          value={nouveauPrix}
          onChange={(e) => setNouveauPrix(e.target.value)}
          placeholder="Prix en €"
          inputMode="decimal"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <button
          onClick={ajouterPlat}
          disabled={ajoutEnCours}
          className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {ajoutEnCours ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
