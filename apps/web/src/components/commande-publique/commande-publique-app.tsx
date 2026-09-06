"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModePaiement } from "@3sauces/supabase";
import type {
  CanalPublic,
  ParametresLivraisonPublic,
  ProduitPublic,
  ViandePublique,
  SaucePublique,
  SaveurPublique,
} from "@/lib/commande-publique/types";
import {
  NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE,
  NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE,
} from "@/lib/commande-publique/types";
import { genererCreneaux, prochainCreneauValide } from "@/lib/commande-publique/creneau";
import { ViandeModalPublique } from "./viande-modal-publique";
import { SaveurModalPublique } from "./saveur-modal-publique";
import { QuantiteModalPublique } from "./quantite-modal-publique";
import { CreneauPicker } from "./creneau-picker";

interface LignePanierPublique {
  id: string;
  produit: ProduitPublic;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
}

interface CommandePubliqueAppProps {
  produits: ProduitPublic[];
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  saveurs: SaveurPublique[];
  parametres: ParametresLivraisonPublic;
}

interface Section {
  key: string;
  titre: string;
  /** Bandeau de titre pleine largeur, alterné rouge/vert d'une section à l'autre — jamais de section sans bandeau. */
  couleur: "rouge" | "vert";
  /** Style compact, sans carte proéminente (Boissons, en fin de page) — indépendant de la couleur du bandeau. */
  discret?: boolean;
  produits: ProduitPublic[];
}

const ROUGE = "#8B2020";
const VERT = "#2D5A27";
const FOND_PAGE = "#F5F0E8";

export function CommandePubliqueApp({ produits, viandes, sauces, saveurs, parametres }: CommandePubliqueAppProps) {
  const router = useRouter();

  const creneauxValides = useMemo(
    () => genererCreneaux(parametres.heureDebut, parametres.heureFin),
    [parametres.heureDebut, parametres.heureFin]
  );

  const [panier, setPanier] = useState<LignePanierPublique[]>([]);
  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  const [produitEnQuantite, setProduitEnQuantite] = useState<ProduitPublic | null>(null);
  const [canal, setCanal] = useState<CanalPublic>("sur_place");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [zone, setZone] = useState(parametres.zonesActives[0] ?? "");
  const [creneauHeure, setCreneauHeure] = useState(() => prochainCreneauValide(creneauxValides));
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  // Ordre imposé : Menus spéciaux, Tacos, Barquettes & Bowls, Grillades,
  // Cuisine locale, puis Boissons en dernier (discrètes). "Tacos" et
  // "Barquettes & Bowls" partagent tous les deux la catégorie DB `snacking` —
  // on les distingue ici par le nom du produit plutôt que par une nouvelle
  // catégorie, pour ne pas complexifier le back-office pour un simple
  // regroupement d'affichage.
  //
  // Chaque section a désormais son bandeau de titre, en alternance stricte
  // rouge/vert d'une section à la suivante (jamais deux bandeaux de la même
  // couleur côte à côte) — couleur fixée à la position dans la liste plutôt
  // que par section elle-même, pour que l'alternance reste correcte même si
  // une section est absente (aucun produit actif dedans, ex: pas de plat en
  // "cuisine_locale" ce jour-là).
  const sections = useMemo<Section[]>(() => {
    const snacking = produits.filter((p) => p.categorie === "snacking");
    const tacos = snacking.filter((p) => p.nom.includes("Tacos") && !p.nom.includes("Bowl"));
    const barquettesBowls = snacking.filter((p) => p.nom.includes("Barquette") || p.nom.includes("Bowl"));

    const liste: Omit<Section, "couleur">[] = [
      { key: "menus", titre: "Menus spéciaux", produits: produits.filter((p) => p.categorie === "menu_special") },
      {
        key: "plat_du_jour",
        titre: "Plats du jour",
        produits: produits.filter((p) => p.categorie === "plat_du_jour"),
      },
      { key: "tacos", titre: "Tacos", produits: tacos },
      { key: "barquettes_bowls", titre: "Barquettes & Bowls", produits: barquettesBowls },
      { key: "grillade", titre: "Grillades", produits: produits.filter((p) => p.categorie === "grillade") },
      {
        key: "accompagnement",
        titre: "Accompagnements",
        produits: produits.filter((p) => p.categorie === "accompagnement"),
      },
      {
        key: "cuisine_locale",
        titre: "Cuisine locale",
        produits: produits.filter((p) => p.categorie === "cuisine_locale"),
      },
      { key: "boisson", titre: "Boissons", discret: true, produits: produits.filter((p) => p.categorie === "boisson") },
    ];
    return liste
      .filter((s) => s.produits.length > 0)
      .map((s, i) => ({ ...s, couleur: i % 2 === 0 ? "rouge" : "vert" }));
  }, [produits]);

  const produitViandeSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  const produitSauceSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );

  const total = panier.reduce((acc, l) => acc + l.produit.prix * l.quantite, 0);
  const nbArticles = panier.reduce((acc, l) => acc + l.quantite, 0);

  const livraisonPossible = parametres.zonesActives.length > 0;
  const minimumAtteint = total >= parametres.minimumCommande;

  // Courte animation sur le panier sticky à chaque ajout — déclenchée
  // directement par l'action utilisateur (pas dans un effect, pour éviter
  // les rendus en cascade) : signal visuel immédiat sans jamais forcer de
  // scroll (cahier des charges).
  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function declencherPulse() {
    setPulse(true);
    if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    pulseTimeout.current = setTimeout(() => setPulse(false), 250);
  }

  function ajouterAuPanier(
    produit: ProduitPublic,
    viandesChoisies: string[],
    saucesChoisies: string[] = [],
    saveursChoisies: string[] = [],
    boissonIncluse: string | null = null,
    quantite: number = 1
  ) {
    declencherPulse();
    setPanier((precedent) => {
      const cle = (l: LignePanierPublique) =>
        l.produit.id === produit.id &&
        JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort()) &&
        JSON.stringify([...l.sauces].sort()) === JSON.stringify([...saucesChoisies].sort()) &&
        JSON.stringify([...l.saveurs].sort()) === JSON.stringify([...saveursChoisies].sort()) &&
        l.boissonIncluse === boissonIncluse;

      const existante = precedent.find(cle);
      if (existante) {
        return precedent.map((l) => (l === existante ? { ...l, quantite: l.quantite + quantite } : l));
      }
      return [
        ...precedent,
        {
          id: `${produit.id}-${Date.now()}-${Math.random()}`,
          produit,
          quantite,
          viandes: viandesChoisies,
          sauces: saucesChoisies,
          saveurs: saveursChoisies,
          boissonIncluse,
        },
      ];
    });
  }

  function surClicProduit(produit: ProduitPublic) {
    // Un configurateur s'ouvre dès qu'il y a une vraie décision à prendre :
    // viande à choisir, sauces incluses à cocher, saveur à choisir, ou
    // extras disponibles. Sinon (ex: boisson à choix unique, grillade,
    // accompagnement), la seule décision qui reste est la quantité — on
    // ouvre quand même une petite fenêtre dédiée (jamais d'ajout direct et
    // silencieux) pour que le client voie le total en € avant de valider.
    const besoinConfigurateur =
      (!produit.viandeImposee && produit.nbViandesMax > 0) ||
      produit.nbSaucesIncluses > 0 ||
      produit.autoriseExtras ||
      produit.nbSaveursMax > 0;

    if (besoinConfigurateur) {
      setProduitEnSelection(produit);
      return;
    }
    setProduitEnQuantite(produit);
  }

  function modifierQuantite(id: string, delta: number) {
    setPanier((precedent) =>
      precedent.map((l) => (l.id === id ? { ...l, quantite: l.quantite + delta } : l)).filter((l) => l.quantite > 0)
    );
  }

  function retirerLigne(id: string) {
    setPanier((precedent) => precedent.filter((l) => l.id !== id));
  }

  function voirPanier() {
    document.getElementById("panier-recap")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            saveurs: l.saveurs,
            boissonIncluse: l.boissonIncluse,
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
    <div className="min-h-screen pb-28" style={{ backgroundColor: FOND_PAGE }}>
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key}>
              <div
                className="mb-2 rounded px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: section.couleur === "rouge" ? ROUGE : VERT }}
              >
                {section.titre}
              </div>

              {section.discret ? (
                <div className="space-y-1.5">
                  {section.produits.map((produit) => (
                    <button
                      key={produit.id}
                      onClick={() => surClicProduit(produit)}
                      className="flex w-full items-center justify-between rounded bg-white px-3 py-2 text-left text-sm text-gray-700 active:bg-gray-50"
                    >
                      <span>{produit.nom}</span>
                      <span className="text-gray-400">{produit.prix.toFixed(2)} €</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {section.produits.map((produit) => (
                    <button
                      key={produit.id}
                      onClick={() => surClicProduit(produit)}
                      className="rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm active:bg-gray-50"
                    >
                      <div className="font-medium text-gray-900">{produit.nom}</div>
                      {produit.description && (
                        <div className="mt-0.5 text-xs text-gray-500">{produit.description}</div>
                      )}
                      <div className="mt-1 font-semibold text-gray-900">{produit.prix.toFixed(2)} €</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div id="panier-recap" className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900">Ton panier</h3>
          {panier.length === 0 && <p className="text-sm text-gray-400">Vide.</p>}
          <ul className="space-y-2">
            {panier.map((l) => (
              <li key={l.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900">{l.produit.nom}</span>
                  <button onClick={() => retirerLigne(l.id)} className="text-gray-400 hover:text-gray-700">
                    ✕
                  </button>
                </div>
                {l.viandes.length > 0 && <div className="text-xs text-gray-500">{l.viandes.join(", ")}</div>}
                {l.saveurs.length > 0 && <div className="text-xs text-gray-500">{l.saveurs.join(", ")}</div>}
                {l.sauces.length > 0 && (
                  <div className="text-xs text-gray-400">Sauces : {l.sauces.join(", ")}</div>
                )}
                {l.boissonIncluse && (
                  <div className="text-xs text-gray-400">Boisson incluse : {l.boissonIncluse}</div>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => modifierQuantite(l.id, -1)}
                    className="rounded border border-gray-300 px-3 py-1 text-gray-700"
                  >
                    -
                  </button>
                  <span className="text-gray-900">{l.quantite}</span>
                  <button
                    onClick={() => modifierQuantite(l.id, 1)}
                    className="rounded border border-gray-300 px-3 py-1 text-gray-700"
                  >
                    +
                  </button>
                  <span className="ml-auto font-medium text-gray-900">
                    {(l.produit.prix * l.quantite).toFixed(2)} €
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-200 pt-3 text-lg font-bold text-gray-900">
            Total : {total.toFixed(2)} €
          </div>

          <div className="border-t border-gray-200 pt-3">
            <label className="text-xs text-gray-500">Nom</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Téléphone</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="0639..."
              className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Comment récupérer ta commande ?</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <button
                onClick={() => setCanal("sur_place")}
                className={`rounded border py-2 text-sm font-bold uppercase ${
                  canal === "sur_place" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                }`}
              >
                Sur place
              </button>
              <button
                onClick={() => setCanal("emporter")}
                className={`rounded border py-2 text-sm font-bold uppercase ${
                  canal === "emporter" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                }`}
              >
                À emporter
              </button>
              <button
                onClick={() => setCanal("livraison")}
                disabled={!livraisonPossible}
                className={`rounded border py-2 text-sm font-bold uppercase disabled:opacity-30 ${
                  canal === "livraison" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                }`}
              >
                Livraison
              </button>
            </div>
            {canal === "livraison" && !minimumAtteint && (
              <p className="mt-2 text-xs text-orange-600">
                Minimum {parametres.minimumCommande.toFixed(2)} € pour la livraison — ajoute des articles ou choisis
                le retrait sur place.
              </p>
            )}
          </div>

          {canal === "livraison" && (
            <>
              <div>
                <label className="text-xs text-gray-500">Adresse</label>
                <input
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Zone</label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
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
            <label className="text-xs text-gray-500">
              Paiement (à la {canal === "livraison" ? "livraison" : "prise en main"})
            </label>
            <select
              value={modePaiement}
              onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
              className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
            >
              <option value="especes">Espèces</option>
              <option value="cb">Carte (terminal SumUp)</option>
            </select>
          </div>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}

          <button
            onClick={commander}
            disabled={panier.length === 0 || envoiEnCours || canalLivraisonBloque}
            className="w-full rounded bg-[#8B2020] py-3 font-semibold text-white disabled:opacity-40"
          >
            {envoiEnCours ? "Envoi…" : "Commander"}
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          {panier.length === 0 ? (
            <span className="text-sm text-gray-400">Ton panier est vide</span>
          ) : (
            <>
              <div className={`transition-transform duration-200 ${pulse ? "scale-110" : "scale-100"}`}>
                <div className="text-sm font-semibold text-gray-900">
                  {nbArticles} article{nbArticles > 1 ? "s" : ""}
                </div>
                <div className="text-xs text-gray-500">{total.toFixed(2)} €</div>
              </div>
              <button
                onClick={voirPanier}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: ROUGE }}
              >
                Voir mon panier
              </button>
            </>
          )}
        </div>
      </div>

      {produitEnSelection && produitEnSelection.nbSaveursMax > 0 && (
        <SaveurModalPublique
          produit={produitEnSelection}
          saveurs={saveurs}
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(saveursChoisies) => {
            for (const nom of saveursChoisies) {
              ajouterAuPanier(produitEnSelection, [], [], [nom]);
            }
            setProduitEnSelection(null);
          }}
        />
      )}

      {produitEnSelection && produitEnSelection.nbSaveursMax === 0 && (
        <ViandeModalPublique
          produit={produitEnSelection}
          viandes={viandes}
          sauces={sauces}
          saveurs={saveurs}
          produitViandeSupplementaire={produitViandeSupplementaire}
          produitSauceSupplementaire={produitSauceSupplementaire}
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(viandesChoisies, saucesChoisies, extras, boissonIncluse) => {
            ajouterAuPanier(produitEnSelection, viandesChoisies, saucesChoisies, [], boissonIncluse);
            if (produitViandeSupplementaire) {
              for (const nomViande of extras.viandesSupplementaires) {
                ajouterAuPanier(produitViandeSupplementaire, [nomViande], []);
              }
            }
            if (produitSauceSupplementaire) {
              for (const nomSauce of extras.saucesSupplementaires) {
                ajouterAuPanier(produitSauceSupplementaire, [], [nomSauce]);
              }
            }
            setProduitEnSelection(null);
          }}
        />
      )}

      {produitEnQuantite && (
        <QuantiteModalPublique
          produit={produitEnQuantite}
          onAnnuler={() => setProduitEnQuantite(null)}
          onValider={(quantite) => {
            ajouterAuPanier(
              produitEnQuantite,
              produitEnQuantite.viandeImposee ? [produitEnQuantite.viandeImposee] : [],
              [],
              [],
              null,
              quantite
            );
            setProduitEnQuantite(null);
          }}
        />
      )}
    </div>
  );
}
