"use client";

import { useMemo, useState } from "react";
import type { Categorie } from "@3sauces/supabase";
import { CATEGORIES, type ProduitAdmin } from "@/lib/patron/produits-types";

interface ProduitsAppProps {
  produitsInitiaux: ProduitAdmin[];
}

interface Brouillon {
  nom: string;
  categorie: Categorie;
  description: string;
  prix: string;
  nbViandesMax: string;
  viandeImposee: string;
  nbSaucesIncluses: string;
  autoriseExtras: boolean;
  nbSaveursMax: boolean;
  canetteIncluse: boolean;
}

function versBrouillon(p: ProduitAdmin): Brouillon {
  return {
    nom: p.nom,
    categorie: p.categorie,
    description: p.description ?? "",
    prix: p.prix !== null ? String(p.prix) : "",
    nbViandesMax: String(p.nbViandesMax),
    viandeImposee: p.viandeImposee ?? "",
    nbSaucesIncluses: String(p.nbSaucesIncluses),
    autoriseExtras: p.autoriseExtras,
    nbSaveursMax: p.nbSaveursMax > 0,
    canetteIncluse: p.canetteIncluse,
  };
}

function estModifie(brouillon: Brouillon, p: ProduitAdmin): boolean {
  const reference = versBrouillon(p);
  return (Object.keys(brouillon) as (keyof Brouillon)[]).some((cle) => brouillon[cle] !== reference[cle]);
}

/**
 * Gestion complète de la carte (Page 3 / Module 6) : remplace l'écran
 * "Plats du jour" (categorie unique) par un écran couvrant tous les
 * produits/catégories — cf. lib/patron/produits.ts.
 */
export function ProduitsApp({ produitsInitiaux }: ProduitsAppProps) {
  const [produits, setProduits] = useState<ProduitAdmin[]>(produitsInitiaux);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>(() =>
    Object.fromEntries(produitsInitiaux.map((p) => [p.id, versBrouillon(p)]))
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState<string | null>(null);

  const [nouveau, setNouveau] = useState({
    nom: "",
    categorie: "plat_du_jour" as Categorie,
    description: "",
    prix: "",
  });
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const parCategorie = useMemo(() => {
    const groupes = new Map<Categorie, ProduitAdmin[]>();
    for (const p of produits) {
      const liste = groupes.get(p.categorie) ?? [];
      liste.push(p);
      groupes.set(p.categorie, liste);
    }
    return CATEGORIES.map((c) => ({ ...c, produits: groupes.get(c.valeur) ?? [] })).filter(
      (c) => c.produits.length > 0
    );
  }, [produits]);

  function modifierBrouillon<K extends keyof Brouillon>(id: string, champ: K, valeur: Brouillon[K]) {
    setBrouillons((precedent) => ({ ...precedent, [id]: { ...precedent[id], [champ]: valeur } }));
  }

  async function basculerActif(produit: ProduitAdmin) {
    setErreur(null);
    const nouvelActif = !produit.actif;
    setProduits((precedent) => precedent.map((p) => (p.id === produit.id ? { ...p, actif: nouvelActif } : p)));

    const reponse = await fetch("/api/patron/produits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: produit.id, actif: nouvelActif }),
    });
    if (!reponse.ok) {
      setProduits((precedent) => precedent.map((p) => (p.id === produit.id ? { ...p, actif: produit.actif } : p)));
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  async function enregistrer(produit: ProduitAdmin) {
    const brouillon = brouillons[produit.id];
    if (!brouillon) return;

    const nom = brouillon.nom.trim();
    if (!nom) {
      setErreur("Le nom ne peut pas être vide.");
      return;
    }
    const prix = brouillon.prix.trim() === "" ? null : Number(brouillon.prix.replace(",", "."));
    if (prix !== null && (!Number.isFinite(prix) || prix < 0)) {
      setErreur("Prix invalide.");
      return;
    }
    const nbViandesMax = Number(brouillon.nbViandesMax);
    const nbSaucesIncluses = Number(brouillon.nbSaucesIncluses);
    if (!Number.isInteger(nbViandesMax) || nbViandesMax < 0 || nbViandesMax > 4) {
      setErreur("Nombre de viandes invalide (0 à 4).");
      return;
    }
    if (!Number.isInteger(nbSaucesIncluses) || nbSaucesIncluses < 0) {
      setErreur("Nombre de sauces incluses invalide.");
      return;
    }

    setErreur(null);
    setEnregistrementEnCours(produit.id);
    try {
      const payload = {
        id: produit.id,
        nom,
        categorie: brouillon.categorie,
        description: brouillon.description.trim() || null,
        prix,
        nbViandesMax,
        viandeImposee: brouillon.viandeImposee.trim() || null,
        nbSaucesIncluses,
        autoriseExtras: brouillon.autoriseExtras,
        nbSaveursMax: brouillon.nbSaveursMax ? 1 : 0,
        canetteIncluse: brouillon.canetteIncluse,
      };
      const reponse = await fetch("/api/patron/produits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      const produitMisAJour: ProduitAdmin = {
        ...produit,
        nom,
        categorie: brouillon.categorie,
        description: payload.description,
        prix,
        nbViandesMax,
        viandeImposee: payload.viandeImposee,
        nbSaucesIncluses,
        autoriseExtras: brouillon.autoriseExtras,
        nbSaveursMax: payload.nbSaveursMax,
        canetteIncluse: brouillon.canetteIncluse,
      };
      setProduits((precedent) => precedent.map((p) => (p.id === produit.id ? produitMisAJour : p)));
      setBrouillons((precedent) => ({ ...precedent, [produit.id]: versBrouillon(produitMisAJour) }));
    } finally {
      setEnregistrementEnCours(null);
    }
  }

  async function supprimer(produit: ProduitAdmin) {
    if (!confirm(`Supprimer définitivement « ${produit.nom} » ?`)) return;
    setErreur(null);
    const precedents = produits;
    setProduits((precedent) => precedent.filter((p) => p.id !== produit.id));

    const reponse = await fetch("/api/patron/produits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: produit.id }),
    });
    if (!reponse.ok) {
      setProduits(precedents);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la suppression.");
    }
  }

  async function ajouter() {
    const nom = nouveau.nom.trim();
    if (!nom) {
      setErreur("Indique un nom pour le nouveau produit.");
      return;
    }
    const prix = nouveau.prix.trim() === "" ? null : Number(nouveau.prix.replace(",", "."));
    if (prix !== null && (!Number.isFinite(prix) || prix < 0)) {
      setErreur("Prix invalide.");
      return;
    }

    setErreur(null);
    setAjoutEnCours(true);
    try {
      const reponse = await fetch("/api/patron/produits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          categorie: nouveau.categorie,
          description: nouveau.description.trim() || null,
          prix,
        }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la création.");
        return;
      }
      const relecture = await fetch("/api/patron/produits", { cache: "no-store" });
      const relectureData = await relecture.json().catch(() => ({ produits: [] }));
      const nouveauxProduits: ProduitAdmin[] = relectureData.produits ?? [];
      setProduits(nouveauxProduits);
      setBrouillons(Object.fromEntries(nouveauxProduits.map((p) => [p.id, versBrouillon(p)])));
      setNouveau({ nom: "", categorie: nouveau.categorie, description: "", prix: "" });
    } finally {
      setAjoutEnCours(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Produits</h2>
      <p className="text-xs text-gray-500">
        Tous les produits du site, groupés par catégorie. Coche/décoche pour activer ou désactiver, modifie les
        champs puis clique &laquo; Enregistrer &raquo;. Un prix laissé vide = prix libre (saisi en caisse).
      </p>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      {parCategorie.map((groupe) => (
        <div key={groupe.valeur} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">{groupe.libelle}</h3>
          <ul className="space-y-3">
            {groupe.produits.map((produit) => {
              const brouillon = brouillons[produit.id] ?? versBrouillon(produit);
              const modifie = estModifie(brouillon, produit);

              return (
                <li key={produit.id} className="space-y-2 rounded border border-gray-700 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={produit.actif} onChange={() => basculerActif(produit)} />
                      {produit.actif ? "Actif" : "Inactif"}
                    </label>
                    <button onClick={() => supprimer(produit)} className="text-xs text-red-400 hover:text-red-300">
                      Supprimer
                    </button>
                  </div>

                  <input
                    value={brouillon.nom}
                    onChange={(e) => modifierBrouillon(produit.id, "nom", e.target.value)}
                    placeholder="Nom du produit"
                    className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                  />
                  <select
                    value={brouillon.categorie}
                    onChange={(e) => modifierBrouillon(produit.id, "categorie", e.target.value as Categorie)}
                    className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.valeur} value={c.valeur}>
                        {c.libelle}
                      </option>
                    ))}
                  </select>
                  <input
                    value={brouillon.description}
                    onChange={(e) => modifierBrouillon(produit.id, "description", e.target.value)}
                    placeholder="Description courte (optionnel)"
                    className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                  />
                  <input
                    value={brouillon.prix}
                    onChange={(e) => modifierBrouillon(produit.id, "prix", e.target.value)}
                    placeholder="Prix en € (vide = prix libre)"
                    inputMode="decimal"
                    className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                  />

                  <details className="rounded border border-gray-700 p-2">
                    <summary className="cursor-pointer text-xs text-gray-400">Options avancées</summary>
                    <div className="mt-2 space-y-2">
                      <label className="block text-xs text-gray-500">
                        Viande imposée (ex: Poulet — laisser vide sinon)
                        <input
                          value={brouillon.viandeImposee}
                          onChange={(e) => modifierBrouillon(produit.id, "viandeImposee", e.target.value)}
                          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                        />
                      </label>
                      <label className="block text-xs text-gray-500">
                        Nombre de viandes à choisir (0 à 4)
                        <input
                          value={brouillon.nbViandesMax}
                          onChange={(e) => modifierBrouillon(produit.id, "nbViandesMax", e.target.value)}
                          inputMode="numeric"
                          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                        />
                      </label>
                      <label className="block text-xs text-gray-500">
                        Nombre de sauces incluses
                        <input
                          value={brouillon.nbSaucesIncluses}
                          onChange={(e) => modifierBrouillon(produit.id, "nbSaucesIncluses", e.target.value)}
                          inputMode="numeric"
                          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.autoriseExtras}
                          onChange={(e) => modifierBrouillon(produit.id, "autoriseExtras", e.target.checked)}
                        />
                        Autorise les extras (viande/sauce supplémentaire)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.nbSaveursMax}
                          onChange={(e) => modifierBrouillon(produit.id, "nbSaveursMax", e.target.checked)}
                        />
                        Propose un choix de saveur (boisson)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.canetteIncluse}
                          onChange={(e) => modifierBrouillon(produit.id, "canetteIncluse", e.target.checked)}
                        />
                        Canette incluse dans le prix
                      </label>
                    </div>
                  </details>

                  {modifie && (
                    <button
                      onClick={() => enregistrer(produit)}
                      disabled={enregistrementEnCours === produit.id}
                      className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {enregistrementEnCours === produit.id ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="space-y-2 rounded border border-dashed border-gray-700 p-3">
        <p className="text-sm font-semibold">Ajouter un nouveau produit</p>
        <input
          value={nouveau.nom}
          onChange={(e) => setNouveau((p) => ({ ...p, nom: e.target.value }))}
          placeholder="Nom du produit"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <select
          value={nouveau.categorie}
          onChange={(e) => setNouveau((p) => ({ ...p, categorie: e.target.value as Categorie }))}
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        >
          {CATEGORIES.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
        <input
          value={nouveau.description}
          onChange={(e) => setNouveau((p) => ({ ...p, description: e.target.value }))}
          placeholder="Description courte (optionnel)"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <input
          value={nouveau.prix}
          onChange={(e) => setNouveau((p) => ({ ...p, prix: e.target.value }))}
          placeholder="Prix en € (vide = prix libre)"
          inputMode="decimal"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <p className="text-xs text-gray-500">
          Les options avancées (viandes, sauces, saveur, canette) se règlent après création, dans « Options
          avancées » de la fiche du produit.
        </p>
        <button
          onClick={ajouter}
          disabled={ajoutEnCours}
          className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {ajoutEnCours ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
