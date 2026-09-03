"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModePaiement } from "@3sauces/supabase";
import type {
  CanalPublic,
  ParametresLivraisonPublic,
  ProduitPublic,
  ViandePublique,
  SaucePublique,
} from "@/lib/commande-publique/types";
import { genererCreneaux, prochainCreneauValide } from "@/lib/commande-publique/creneau";
import { ViandeModalPublique } from "./viande-modal-publique";
import { CreneauPicker } from "./creneau-picker";

interface LignePanierPublique {
  id: string;
  produit: ProduitPublic;
  quantite: number;
  viandes: string[];
  sauces: string[];
}

interface CommandePubliqueAppProps {
  produits: ProduitPublic[];
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  parametres: ParametresLivraisonPublic;
}

const LIBELLES_CATEGORIES: Record<string, string> = {
  menu_special: "Menus spéciaux",
  snacking: "Snacking",
  grillade: "Grillades",
  cuisine_locale: "Cuisine locale",
  boisson: "Boissons",
  supplement: "Suppléments",
};

export function CommandePubliqueApp({ produits, viandes, sauces, parametres }: CommandePubliqueAppProps) {
  const router = useRouter();

  const creneauxValides = useMemo(
    () => genererCreneaux(parametres.heureDebut, parametres.heureFin),
    [parametres.heureDebut, parametres.heureFin]
  );

  const [panier, setPanier] = useState<LignePanierPublique[]>([]);
  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  const [canal, setCanal] = useState<CanalPublic>("sur_place");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [zone, setZone] = useState(parametres.zonesActives[0] ?? "");
  const [creneauHeure, setCreneauHeure] = useState(() => prochainCreneauValide(creneauxValides));
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const categories = useMemo(() => {
    const parCategorie = new Map<string, ProduitPublic[]>();
    for (const p of produits) {
      const liste = parCategorie.get(p.categorie) ?? [];
      liste.push(p);
      parCategorie.set(p.categorie, liste);
    }
    return parCategorie;
  }, [produits]);

  const total = panier.reduce((acc, l) => acc + l.produit.prix * l.quantite, 0);

  const livraisonPossible = parametres.zonesActives.length > 0;
  const minimumAtteint = total >= parametres.minimumCommande;

  function ajouterAuPanier(produit: ProduitPublic, viandesChoisies: string[], saucesChoisies: string[] = []) {
    setPanier((precedent) => {
      const cle = (l: LignePanierPublique) =>
        l.produit.id === produit.id &&
        JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort()) &&
        JSON.stringify([...l.sauces].sort()) === JSON.stringify([...saucesChoisies].sort());

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
          sauces: saucesChoisies,
        },
      ];
    });
  }

  function surClicProduit(produit: ProduitPublic) {
    if (produit.nbViandesMax > 0) {
      setProduitEnSelection(produit);
    } else {
      ajouterAuPanier(produit, []);
    }
  }

  function modifierQuantite(id: string, delta: number) {
    setPanier((precedent) =>
      precedent.map((l) => (l.id === id ? { ...l, quantite: l.quantite + delta } : l)).filter((l) => l.quantite > 0)
    );
  }

  function retirerLigne(id: string) {
    setPanier((precedent) => precedent.filter((l) => l.id !== id));
  }

  const canalLivraisonBloque = canal === "livraison" && (!livraisonPossible || !minimumAtteint);

  async function commander() {
    setErreur(null);

    if (panier.length === 0) {
      setErreur("Ton panier est vide.");
      return;
    }
    if (!nom.trim()) {
      setErreur("Indique ton nom.");
      return;
    }
    if (!telephone.trim()) {
      setErreur("Indique ton numéro de téléphone.");
      return;
    }
    if (canal === "livraison") {
      if (!adresse.trim()) {
        setErreur("Indique ton adresse de livraison.");
        return;
      }
      if (!minimumAtteint) {
        setErreur(
          `Minimum ${parametres.minimumCommande.toFixed(2)} € pour la livraison. Choisis le retrait sur place ou ajoute des articles.`
        );
        return;
      }
    }

    setEnvoiEnCours(true);
    try {
      const reponse = await fetch("/api/commande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          nom: nom.trim(),
          telephone: telephone.trim(),
          modePaiement,
          creneauHeure,
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          lignes: panier.map((l) => ({
            produitId: l.produit.id,
            quantite: l.quantite,
            viandes: l.viandes,
            sauces: l.sauces,
          })),
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'envoi de la commande.");
        return;
      }
      router.push(`/commande-confirmee?canal=${canal}&heure=${encodeURIComponent(creneauHeure)}`);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-32">
      <div className="space-y-6">
        {[...categories.entries()].map(([categorie, liste]) => (
          <div key={categorie}>
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-400">
              {LIBELLES_CATEGORIES[categorie] ?? categorie}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {liste.map((produit) => (
                <button
                  key={produit.id}
                  onClick={() => surClicProduit(produit)}
                  className="rounded border border-gray-700 p-3 text-left text-sm active:bg-gray-900"
                >
                  <div className="font-medium">{produit.nom}</div>
                  {produit.description && (
                    <div className="mt-0.5 text-xs text-gray-500">{produit.description}</div>
                  )}
                  <div className="text-gray-400">{produit.prix.toFixed(2)} €</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded border border-gray-700 p-4">
        <h3 className="font-semibold">Ton panier</h3>
        {panier.length === 0 && <p className="text-sm text-gray-500">Vide.</p>}
        <ul className="space-y-2">
          {panier.map((l) => (
            <li key={l.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span>{l.produit.nom}</span>
                <button onClick={() => retirerLigne(l.id)} className="text-gray-500">
                  ✕
                </button>
              </div>
              {l.viandes.length > 0 && <div className="text-xs text-gray-400">{l.viandes.join(", ")}</div>}
              {l.sauces.length > 0 && (
                <div className="text-xs text-gray-500">Sauces : {l.sauces.join(", ")}</div>
              )}
              <div className="mt-1 flex items-center gap-2">
                <button onClick={() => modifierQuantite(l.id, -1)} className="rounded border border-gray-600 px-3 py-1">
                  -
                </button>
                <span>{l.quantite}</span>
                <button onClick={() => modifierQuantite(l.id, 1)} className="rounded border border-gray-600 px-3 py-1">
                  +
                </button>
                <span className="ml-auto">{(l.produit.prix * l.quantite).toFixed(2)} €</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-gray-700 pt-3 text-lg font-bold">Total : {total.toFixed(2)} €</div>

        <div className="border-t border-gray-700 pt-3">
          <label className="text-xs text-gray-400">Nom</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mt-1 w-full rounded border border-gray-600 bg-black p-3 text-base"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400">Téléphone</label>
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="0639..."
            className="mt-1 w-full rounded border border-gray-600 bg-black p-3 text-base"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400">Comment récupérer ta commande ?</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              onClick={() => setCanal("sur_place")}
              className={`rounded border py-2 text-sm ${canal === "sur_place" ? "border-white bg-white text-black" : "border-gray-600"}`}
            >
              Sur place
            </button>
            <button
              onClick={() => setCanal("livraison")}
              disabled={!livraisonPossible}
              className={`rounded border py-2 text-sm disabled:opacity-30 ${canal === "livraison" ? "border-white bg-white text-black" : "border-gray-600"}`}
            >
              Livraison
            </button>
          </div>
          {canal === "livraison" && !minimumAtteint && (
            <p className="mt-2 text-xs text-orange-400">
              Minimum {parametres.minimumCommande.toFixed(2)} € pour la livraison — ajoute des articles ou choisis le
              retrait sur place.
            </p>
          )}
        </div>

        {canal === "livraison" && (
          <>
            <div>
              <label className="text-xs text-gray-400">Adresse</label>
              <input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                className="mt-1 w-full rounded border border-gray-600 bg-black p-3 text-base"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Zone</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="mt-1 w-full rounded border border-gray-600 bg-black p-3 text-base"
              >
                {parametres.zonesActives.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <CreneauPicker
          creneauxValides={creneauxValides}
          valeur={creneauHeure}
          onChange={setCreneauHeure}
          label={canal === "livraison" ? "Créneau de livraison souhaité" : "Heure de passage souhaitée"}
        />

        <div>
          <label className="text-xs text-gray-400">Paiement (à la {canal === "livraison" ? "livraison" : "prise en main"})</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
            className="mt-1 w-full rounded border border-gray-600 bg-black p-3 text-base"
          >
            <option value="especes">Espèces</option>
            <option value="cb">Carte (terminal SumUp)</option>
          </select>
        </div>

        {erreur && <p className="text-sm text-red-400">{erreur}</p>}

        <button
          onClick={commander}
          disabled={panier.length === 0 || envoiEnCours || canalLivraisonBloque}
          className="w-full rounded bg-white py-3 font-semibold text-black disabled:opacity-40"
        >
          {envoiEnCours ? "Envoi…" : "Commander"}
        </button>
      </div>

      {produitEnSelection && (
        <ViandeModalPublique
          produit={produitEnSelection}
          viandes={viandes}
          sauces={sauces}
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(viandesChoisies, saucesChoisies) => {
            ajouterAuPanier(produitEnSelection, viandesChoisies, saucesChoisies);
            setProduitEnSelection(null);
          }}
        />
      )}
    </div>
  );
}
