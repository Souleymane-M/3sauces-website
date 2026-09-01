"use client";

import { useMemo, useState } from "react";
import type { Canal, ModePaiement } from "@3sauces/supabase";
import type { ProduitCaisse, ViandeCaisse } from "@/lib/caisse/types";
import { ViandeModal } from "./viande-modal";

interface LignePanier {
  id: string;
  produit: ProduitCaisse;
  quantite: number;
  viandes: string[];
  prixSaisi?: number;
}

interface CaisseAppProps {
  produits: ProduitCaisse[];
  viandes: ViandeCaisse[];
  nomEmploye: string;
}

const LIBELLES_CATEGORIES: Record<string, string> = {
  menu_special: "Menus spéciaux",
  snacking: "Snacking",
  grillade: "Grillades",
  cuisine_locale: "Cuisine locale",
  boisson: "Boissons",
  supplement: "Suppléments",
};

interface ClientInfo {
  existe: boolean;
  telephone: string;
  tampons_acquis?: number;
  recompense_disponible?: boolean;
}

export function CaisseApp({ produits, viandes, nomEmploye }: CaisseAppProps) {
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [produitEnSelection, setProduitEnSelection] = useState<ProduitCaisse | null>(null);
  const [canal, setCanal] = useState<Canal>("sur_place");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [telephone, setTelephone] = useState("");
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [appliquerRecompense, setAppliquerRecompense] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ commandeId: string; montant: number } | null>(
    null
  );

  const categories = useMemo(() => {
    const parCategorie = new Map<string, ProduitCaisse[]>();
    for (const p of produits) {
      const liste = parCategorie.get(p.categorie) ?? [];
      liste.push(p);
      parCategorie.set(p.categorie, liste);
    }
    return parCategorie;
  }, [produits]);

  const total = panier.reduce((acc, l) => {
    const prix = l.produit.prix ?? l.prixSaisi ?? 0;
    return acc + prix * l.quantite;
  }, 0);

  function ajouterAuPanier(produit: ProduitCaisse, viandesChoisies: string[], prixSaisi?: number) {
    setPanier((precedent) => {
      const cle = (l: LignePanier) =>
        l.produit.id === produit.id &&
        l.prixSaisi === prixSaisi &&
        JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort());

      const existante = precedent.find(cle);
      if (existante) {
        return precedent.map((l) => (l === existante ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [
        ...precedent,
        {
          id: `${produit.id}-${Date.now()}-${Math.random()}`,
          produit,
          quantite: 1,
          viandes: viandesChoisies,
          prixSaisi,
        },
      ];
    });
  }

  function surClicProduit(produit: ProduitCaisse) {
    if (produit.nbViandesMax > 0 || produit.prix === null) {
      setProduitEnSelection(produit);
    } else {
      ajouterAuPanier(produit, []);
    }
  }

  function modifierQuantite(id: string, delta: number) {
    setPanier((precedent) =>
      precedent
        .map((l) => (l.id === id ? { ...l, quantite: l.quantite + delta } : l))
        .filter((l) => l.quantite > 0)
    );
  }

  function retirerLigne(id: string) {
    setPanier((precedent) => precedent.filter((l) => l.id !== id));
  }

  async function rechercherClient() {
    if (!telephone.trim()) return;
    setRechercheEnCours(true);
    setClientInfo(null);
    setAppliquerRecompense(false);
    try {
      const reponse = await fetch(`/api/caisse/clients?telephone=${encodeURIComponent(telephone)}`);
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Numéro invalide.");
        return;
      }
      setClientInfo(data);
      setErreur(null);
    } finally {
      setRechercheEnCours(false);
    }
  }

  async function encaisser() {
    if (panier.length === 0) return;
    setEnvoiEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/caisse/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          modePaiement,
          clientTelephone: telephone.trim() || undefined,
          recompenseAppliquee: appliquerRecompense,
          lignes: panier.map((l) => ({
            produitId: l.produit.id,
            quantite: l.quantite,
            viandes: l.viandes,
            prixSaisi: l.prixSaisi,
          })),
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'encaissement.");
        return;
      }
      setConfirmation({ commandeId: data.commandeId, montant: data.montant });
      setPanier([]);
      setTelephone("");
      setClientInfo(null);
      setAppliquerRecompense(false);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (confirmation) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-bold">Commande encaissée ✅</p>
        <p className="text-gray-400">Montant : {confirmation.montant.toFixed(2)} €</p>
        <button
          onClick={() => setConfirmation(null)}
          className="rounded bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Nouvelle commande
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {[...categories.entries()].map(([categorie, liste]) => (
          <div key={categorie}>
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-400">
              {LIBELLES_CATEGORIES[categorie] ?? categorie}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {liste.map((produit) => (
                <button
                  key={produit.id}
                  onClick={() => surClicProduit(produit)}
                  className="rounded border border-gray-700 p-3 text-left text-sm hover:bg-gray-900"
                >
                  <div className="font-medium">{produit.nom}</div>
                  <div className="text-gray-400">
                    {produit.prix !== null ? `${produit.prix.toFixed(2)} €` : "Prix du jour"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded border border-gray-700 p-4">
        <p className="text-sm text-gray-400">Caissier·e : {nomEmploye}</p>

        <div>
          <h3 className="font-semibold">Panier</h3>
          {panier.length === 0 && <p className="text-sm text-gray-500">Vide.</p>}
          <ul className="mt-2 space-y-2">
            {panier.map((l) => (
              <li key={l.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span>{l.produit.nom}</span>
                  <button onClick={() => retirerLigne(l.id)} className="text-gray-500 hover:text-red-400">
                    ✕
                  </button>
                </div>
                {l.viandes.length > 0 && (
                  <div className="text-xs text-gray-400">{l.viandes.join(", ")}</div>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => modifierQuantite(l.id, -1)}
                    className="rounded border border-gray-600 px-2"
                  >
                    -
                  </button>
                  <span>{l.quantite}</span>
                  <button
                    onClick={() => modifierQuantite(l.id, 1)}
                    className="rounded border border-gray-600 px-2"
                  >
                    +
                  </button>
                  <span className="ml-auto">
                    {((l.produit.prix ?? l.prixSaisi ?? 0) * l.quantite).toFixed(2)} €
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-700 pt-3">
          <label className="text-xs text-gray-400">Téléphone client (fidélité, optionnel)</label>
          <div className="mt-1 flex gap-2">
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="0639..."
              className="w-full rounded border border-gray-600 bg-black p-2 text-sm"
            />
            <button
              onClick={rechercherClient}
              disabled={rechercheEnCours}
              className="rounded border border-gray-600 px-3 text-sm"
            >
              🔍
            </button>
          </div>
          {clientInfo && (
            <div className="mt-2 text-xs text-gray-400">
              {clientInfo.existe ? (
                <>
                  <p>Tampons : {clientInfo.tampons_acquis}/10</p>
                  {clientInfo.recompense_disponible && (
                    <label className="mt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={appliquerRecompense}
                        onChange={(e) => setAppliquerRecompense(e.target.checked)}
                      />
                      Appliquer la récompense (-10 €)
                    </label>
                  )}
                </>
              ) : (
                <p>Nouveau client (sera créé au paiement).</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 pt-3">
          <label className="text-xs text-gray-400">Canal</label>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value as Canal)}
            className="mt-1 w-full rounded border border-gray-600 bg-black p-2 text-sm"
          >
            <option value="sur_place">Sur place</option>
            <option value="emporter">À emporter</option>
            <option value="livraison">Livraison</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400">Paiement</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
            className="mt-1 w-full rounded border border-gray-600 bg-black p-2 text-sm"
          >
            <option value="especes">Espèces</option>
            <option value="cb">Carte (SumUp)</option>
          </select>
        </div>

        <div className="border-t border-gray-700 pt-3 text-lg font-bold">
          Total :{" "}
          {(appliquerRecompense && clientInfo?.recompense_disponible
            ? Math.max(0, total - 10)
            : total
          ).toFixed(2)}{" "}
          €
        </div>

        {erreur && <p className="text-sm text-red-400">{erreur}</p>}

        <button
          onClick={encaisser}
          disabled={panier.length === 0 || envoiEnCours}
          className="w-full rounded bg-white py-3 font-semibold text-black disabled:opacity-40"
        >
          {envoiEnCours ? "Encaissement…" : "Encaisser"}
        </button>
      </div>

      {produitEnSelection && (
        <ViandeModal
          produit={produitEnSelection}
          viandes={viandes}
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(viandesChoisies, prixSaisi) => {
            ajouterAuPanier(produitEnSelection, viandesChoisies, prixSaisi);
            setProduitEnSelection(null);
          }}
        />
      )}
    </div>
  );
}
