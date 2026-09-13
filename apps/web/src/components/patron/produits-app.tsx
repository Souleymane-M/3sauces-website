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

function libelleDe(categorie: Categorie): string {
  return CATEGORIES.find((c) => c.valeur === categorie)?.libelle ?? categorie;
}

const inputClasse = "w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white";

/**
 * Gestion complète de la carte (Page 3 / Module 6), refonte du
 * 2026-09-13 : la vue par défaut est sobre (nom/prix/interrupteur), un seul
 * produit modifiable à la fois via "Modifier", et un changement de
 * catégorie passe obligatoirement par une confirmation explicite — plus de
 * menu déroulant catégorie librement modifiable à la volée.
 */
export function ProduitsApp({ produitsInitiaux }: ProduitsAppProps) {
  const [produits, setProduits] = useState<ProduitAdmin[]>(produitsInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);

  const [produitEnEdition, setProduitEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);

  const [sectionAjout, setSectionAjout] = useState<Categorie | null>(null);
  const [nouveau, setNouveau] = useState({ nom: "", description: "", prix: "" });
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  // Les 8 sections s'affichent toujours, même vides — structure stable,
  // jamais une catégorie qui "disparaît" parce qu'elle n'a plus de produit.
  const parCategorie = useMemo(() => {
    const groupes = new Map<Categorie, ProduitAdmin[]>();
    for (const p of produits) {
      const liste = groupes.get(p.categorie) ?? [];
      liste.push(p);
      groupes.set(p.categorie, liste);
    }
    return CATEGORIES.map((c) => ({
      ...c,
      produits: (groupes.get(c.valeur) ?? []).sort((a, b) => a.nom.localeCompare(b.nom)),
    }));
  }, [produits]);

  function ouvrirEdition(produit: ProduitAdmin) {
    setErreur(null);
    setProduitEnEdition(produit.id);
    setBrouillon(versBrouillon(produit));
  }

  function fermerEdition() {
    setProduitEnEdition(null);
    setBrouillon(null);
  }

  function modifierBrouillon<K extends keyof Brouillon>(champ: K, valeur: Brouillon[K]) {
    setBrouillon((precedent) => (precedent ? { ...precedent, [champ]: valeur } : precedent));
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

  async function enregistrer() {
    const produit = produits.find((p) => p.id === produitEnEdition);
    if (!produit || !brouillon) return;

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
    setEnregistrementEnCours(true);
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
      fermerEdition();
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  async function supprimer(produit: ProduitAdmin) {
    if (!confirm(`Supprimer définitivement « ${produit.nom} » ?`)) return;
    setErreur(null);
    const precedents = produits;
    setProduits((precedent) => precedent.filter((p) => p.id !== produit.id));
    if (produitEnEdition === produit.id) fermerEdition();

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

  function ouvrirAjout(categorie: Categorie) {
    setErreur(null);
    setSectionAjout(categorie);
    setNouveau({ nom: "", description: "", prix: "" });
  }

  async function ajouter() {
    if (!sectionAjout) return;
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
          categorie: sectionAjout,
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
      setProduits(relectureData.produits ?? []);
      setSectionAjout(null);
    } finally {
      setAjoutEnCours(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h2 className="text-lg font-bold">Produits</h2>
      <p className="text-xs text-gray-500">
        Les produits du site, groupés par catégorie. L&apos;interrupteur active/désactive immédiatement ; « Modifier
        » ouvre la fiche complète d&apos;un produit.
      </p>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      {parCategorie.map((groupe) => (
        <div key={groupe.valeur} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">{groupe.libelle}</h3>

          {groupe.produits.length === 0 && <p className="text-xs text-gray-600">Aucun produit.</p>}

          <ul className="space-y-3">
            {groupe.produits.map((produit) =>
              produitEnEdition === produit.id && brouillon ? (
                <li key={produit.id} className="space-y-2 rounded border border-gray-600 bg-gray-800/50 p-3">
                  <input
                    value={brouillon.nom}
                    onChange={(e) => modifierBrouillon("nom", e.target.value)}
                    placeholder="Nom du produit"
                    className={inputClasse}
                  />

                  <CategorieChamp
                    categorieActuelle={brouillon.categorie}
                    onConfirmer={(c) => modifierBrouillon("categorie", c)}
                  />

                  <input
                    value={brouillon.description}
                    onChange={(e) => modifierBrouillon("description", e.target.value)}
                    placeholder="Description courte (optionnel)"
                    className={inputClasse}
                  />
                  <input
                    value={brouillon.prix}
                    onChange={(e) => modifierBrouillon("prix", e.target.value)}
                    placeholder="Prix en € (vide = prix libre)"
                    inputMode="decimal"
                    className={inputClasse}
                  />

                  <details className="rounded border border-gray-700 p-2">
                    <summary className="cursor-pointer text-xs text-gray-400">Options avancées</summary>
                    <div className="mt-2 space-y-2">
                      <label className="block text-xs text-gray-500">
                        Viande imposée (ex: Poulet — laisser vide sinon)
                        <input
                          value={brouillon.viandeImposee}
                          onChange={(e) => modifierBrouillon("viandeImposee", e.target.value)}
                          className={`mt-1 ${inputClasse}`}
                        />
                      </label>
                      <label className="block text-xs text-gray-500">
                        Nombre de viandes à choisir (0 à 4)
                        <input
                          value={brouillon.nbViandesMax}
                          onChange={(e) => modifierBrouillon("nbViandesMax", e.target.value)}
                          inputMode="numeric"
                          className={`mt-1 ${inputClasse}`}
                        />
                      </label>
                      <label className="block text-xs text-gray-500">
                        Nombre de sauces incluses
                        <input
                          value={brouillon.nbSaucesIncluses}
                          onChange={(e) => modifierBrouillon("nbSaucesIncluses", e.target.value)}
                          inputMode="numeric"
                          className={`mt-1 ${inputClasse}`}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.autoriseExtras}
                          onChange={(e) => modifierBrouillon("autoriseExtras", e.target.checked)}
                        />
                        Autorise les extras (viande/sauce supplémentaire)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.nbSaveursMax}
                          onChange={(e) => modifierBrouillon("nbSaveursMax", e.target.checked)}
                        />
                        Propose un choix de saveur (boisson)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={brouillon.canetteIncluse}
                          onChange={(e) => modifierBrouillon("canetteIncluse", e.target.checked)}
                        />
                        Canette incluse dans le prix
                      </label>
                    </div>
                  </details>

                  <div className="flex gap-2">
                    <button
                      onClick={enregistrer}
                      disabled={enregistrementEnCours}
                      className="flex-1 rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button
                      onClick={fermerEdition}
                      disabled={enregistrementEnCours}
                      className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 disabled:opacity-40"
                    >
                      Annuler
                    </button>
                  </div>
                </li>
              ) : (
                <li key={produit.id} className="rounded border border-gray-700 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-white">{produit.nom}</div>
                      {produit.description && <div className="text-xs text-gray-400">{produit.description}</div>}
                      <div className="mt-0.5 text-sm text-gray-300">
                        {produit.prix !== null ? `${produit.prix.toFixed(2)} €` : "Prix libre"}
                      </div>
                    </div>
                    <InterrupteurActif actif={produit.actif} onBasculer={() => basculerActif(produit)} />
                  </div>
                  <div className="mt-2 flex gap-3 text-xs">
                    <button onClick={() => ouvrirEdition(produit)} className="text-blue-400 hover:text-blue-300">
                      Modifier
                    </button>
                    <button onClick={() => supprimer(produit)} className="text-red-400 hover:text-red-300">
                      Supprimer
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>

          {sectionAjout === groupe.valeur ? (
            <div className="space-y-2 rounded border border-dashed border-gray-700 p-3">
              <input
                value={nouveau.nom}
                onChange={(e) => setNouveau((p) => ({ ...p, nom: e.target.value }))}
                placeholder="Nom du produit"
                className={inputClasse}
              />
              <input
                value={nouveau.description}
                onChange={(e) => setNouveau((p) => ({ ...p, description: e.target.value }))}
                placeholder="Description courte (optionnel)"
                className={inputClasse}
              />
              <input
                value={nouveau.prix}
                onChange={(e) => setNouveau((p) => ({ ...p, prix: e.target.value }))}
                placeholder="Prix en € (vide = prix libre)"
                inputMode="decimal"
                className={inputClasse}
              />
              <p className="text-xs text-gray-500">
                Les options avancées (viandes, sauces, saveur, canette) se règlent après création, via « Modifier ».
              </p>
              <div className="flex gap-2">
                <button
                  onClick={ajouter}
                  disabled={ajoutEnCours}
                  className="flex-1 rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {ajoutEnCours ? "Ajout…" : "Ajouter"}
                </button>
                <button
                  onClick={() => setSectionAjout(null)}
                  disabled={ajoutEnCours}
                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 disabled:opacity-40"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => ouvrirAjout(groupe.valeur)}
              className="w-full rounded border border-dashed border-gray-700 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
            >
              + Ajouter un produit
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function InterrupteurActif({ actif, onBasculer }: { actif: boolean; onBasculer: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        onClick={onBasculer}
        className={`relative h-6 w-11 rounded-full transition-colors ${actif ? "bg-green-600" : "bg-gray-600"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            actif ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-xs text-gray-400">{actif ? "Actif" : "Inactif"}</span>
    </div>
  );
}

/**
 * Catégorie affichée en lecture seule par défaut ("Menu spécial") avec un
 * lien pour la changer — le changement n'est appliqué au brouillon qu'après
 * confirmation explicite du message "passera de X à Y", jamais via un
 * simple <select> qu'on peut modifier par inadvertance.
 */
function CategorieChamp({
  categorieActuelle,
  onConfirmer,
}: {
  categorieActuelle: Categorie;
  onConfirmer: (c: Categorie) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [choix, setChoix] = useState<Categorie>(categorieActuelle);

  if (!enCours) {
    return (
      <div className="text-xs text-gray-400">
        Catégorie : <span className="text-white">{libelleDe(categorieActuelle)}</span>{" "}
        <button
          type="button"
          onClick={() => {
            setChoix(categorieActuelle);
            setEnCours(true);
          }}
          className="text-blue-400 underline hover:text-blue-300"
        >
          Changer de catégorie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-orange-700 bg-orange-950/30 p-2">
      <select value={choix} onChange={(e) => setChoix(e.target.value as Categorie)} className={inputClasse}>
        {CATEGORIES.map((c) => (
          <option key={c.valeur} value={c.valeur}>
            {c.libelle}
          </option>
        ))}
      </select>
      {choix !== categorieActuelle && (
        <p className="text-xs text-orange-300">
          Ce produit passera de « {libelleDe(categorieActuelle)} » à « {libelleDe(choix)} ».
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onConfirmer(choix);
            setEnCours(false);
          }}
          disabled={choix === categorieActuelle}
          className="flex-1 rounded bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40"
        >
          Confirmer
        </button>
        <button
          type="button"
          onClick={() => setEnCours(false)}
          className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
