"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Canal, ModePaiement } from "@3sauces/supabase";
import type { ProduitCaisse, ViandeCaisse, SauceCaisse, SaveurCaisse, LigneCommande } from "@/lib/caisse/types";
import type { ParametresLivraisonPublic } from "@/lib/commande-publique/types";
import {
  NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE,
  NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE,
} from "@/lib/commande-publique/types";
import { genererCreneaux, prochainCreneauValide, construireHeureSouhaiteeUtc } from "@/lib/commande-publique/creneau";
import { ViandeModalPublique } from "@/components/commande-publique/viande-modal-publique";
import { SaveurModalPublique } from "@/components/commande-publique/saveur-modal-publique";
import { QuantiteModalPublique } from "@/components/commande-publique/quantite-modal-publique";
import { CreneauPicker } from "@/components/commande-publique/creneau-picker";
import type { ImprimanteAdmin } from "@/lib/patron/imprimantes-types";
import type { CommandePourImpression, ConfigImprimante } from "@/lib/impression/types";
import { imprimerCommande, type ConfigImprimantes } from "@/lib/impression/imprimer-commande";
import { jouerAlerteSonore } from "@/lib/impression/alerte-sonore";

interface LignePanier {
  id: string;
  produit: ProduitCaisse;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
  prixSaisi?: number;
}

interface CaisseAppProps {
  produits: ProduitCaisse[];
  viandes: ViandeCaisse[];
  sauces: SauceCaisse[];
  saveurs: SaveurCaisse[];
  parametres: ParametresLivraisonPublic;
  imprimantesInitiales: ImprimanteAdmin[];
  nomEmploye: string;
}

// Clés localStorage du polling des commandes en ligne : persistées pour que
// le fil ne se coupe pas à chaque rechargement/veille de l'iPad (sinon soit
// on republierait tout l'historique du matin, soit on raterait les
// commandes arrivées pendant la coupure).
const CLE_CURSEUR = "caisse_impression_depuis";
const CLE_IMPRIMES = "caisse_impression_imprimes";
const MAX_IDS_MEMORISES = 200;
const INTERVALLE_POLLING_MS = 7000;

function versConfigImprimantes(liste: ImprimanteAdmin[]): ConfigImprimantes {
  const comptoir = liste.find((i) => i.role === "comptoir");
  const cuisine = liste.find((i) => i.role === "cuisine");
  const config = (i: ImprimanteAdmin | undefined): ConfigImprimante | null =>
    i?.adresseIp ? { adresseIp: i.adresseIp, port: i.port } : null;
  return { comptoir: config(comptoir), cuisine: config(cuisine) };
}

interface Section {
  key: string;
  titre: string;
  couleur: "rouge" | "vert";
  discret?: boolean;
  produits: ProduitCaisse[];
}

const ROUGE = "#8B2020";
const VERT = "#2D5A27";

interface ClientInfo {
  existe: boolean;
  telephone: string;
  tampons_acquis?: number;
  recompense_disponible?: boolean;
}

/**
 * Prise de commande caisse (Module 1) : mêmes règles, mêmes fenêtres de
 * configuration et même thème visuel clair que le site public (/commander)
 * — viandes/sauces à choix multiples, extras illimités, choix de saveur de
 * boisson, canette incluse, créneau souhaité et flux de livraison complet —
 * réutilisés tels quels (ViandeModalPublique/SaveurModalPublique/
 * QuantiteModalPublique/CreneauPicker) pour garantir un comportement
 * identique, jamais une copie parallèle qui pourrait diverger. Seule
 * différence caisse : un produit à prix libre (`prix === null`, ex: "Plat du
 * jour") demande un prix du jour dans QuantiteModalPublique, cas qui
 * n'existe jamais côté public.
 *
 * Nom et téléphone sont obligatoires pour encaisser (comme nom/téléphone le
 * sont pour commander sur le site public), quel que soit le canal —
 * l'adresse ne l'est que pour la livraison.
 */
export function CaisseApp({
  produits,
  viandes,
  sauces,
  saveurs,
  parametres,
  imprimantesInitiales,
  nomEmploye,
}: CaisseAppProps) {
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [produitEnSelection, setProduitEnSelection] = useState<ProduitCaisse | null>(null);
  const [produitEnQuantite, setProduitEnQuantite] = useState<ProduitCaisse | null>(null);
  const [canal, setCanal] = useState<Canal>("sur_place");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [telephone, setTelephone] = useState("");
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [appliquerRecompense, setAppliquerRecompense] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ commandeId: string; montant: number } | null>(null);

  // Créneau souhaité pour tous les canaux (comme le site public : "Heure de
  // passage souhaitée" pour sur place/à emporter, "Créneau de livraison
  // souhaité" pour la livraison) ; adresse/zone restent propres à la
  // livraison. Nom et téléphone sont obligatoires pour tous les canaux,
  // comme sur le site public.
  const creneauxValides = useMemo(
    () => genererCreneaux(parametres.heureDebut, parametres.heureFin),
    [parametres.heureDebut, parametres.heureFin]
  );
  const [creneauHeure, setCreneauHeure] = useState(() => prochainCreneauValide(creneauxValides));
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [zone, setZone] = useState(parametres.zonesActives[0] ?? "");

  // Impression thermique (comptoir + cuisine) : la config réseau est
  // re-récupérée juste avant chaque impression (pas seulement au chargement)
  // pour qu'un changement d'IP fait depuis /patron en plein service prenne
  // effet sans recharger l'onglet.
  const [imprimantes, setImprimantes] = useState<ImprimanteAdmin[]>(imprimantesInitiales);
  const [avertissementImpression, setAvertissementImpression] = useState<string | null>(null);
  const depuisRef = useRef<string | null>(null);
  const idsImprimesRef = useRef<Set<string>>(new Set());

  async function recupererImprimantes(): Promise<ImprimanteAdmin[]> {
    try {
      const reponse = await fetch("/api/caisse/imprimantes", { cache: "no-store" });
      if (!reponse.ok) return imprimantes;
      const data = await reponse.json();
      const liste: ImprimanteAdmin[] = data.imprimantes ?? imprimantes;
      setImprimantes(liste);
      return liste;
    } catch {
      return imprimantes;
    }
  }

  async function imprimerEtSignaler(commande: CommandePourImpression) {
    const liste = await recupererImprimantes();
    const resultat = await imprimerCommande(commande, versConfigImprimantes(liste));
    const messages: string[] = [];
    if (resultat.comptoir && !resultat.comptoir.ok) messages.push(`Comptoir : ${resultat.comptoir.erreur}`);
    if (resultat.cuisine && !resultat.cuisine.ok) messages.push(`Cuisine : ${resultat.cuisine.erreur}`);
    setAvertissementImpression(messages.length > 0 ? messages.join(" · ") : null);
  }

  // Détecte les commandes reçues depuis le site public (jamais celles
  // prises au comptoir, cf. lib/caisse/nouvelles-commandes.ts) pour les
  // imprimer + jouer une alerte sonore, sans que l'employé ait à faire quoi
  // que ce soit. Curseur + ids déjà imprimés persistés en localStorage :
  // seul le tout premier chargement (rien en localStorage) démarre le
  // curseur à "maintenant", pour ne jamais imprimer en rafale l'historique
  // du matin ; un rechargement/veille reprend ensuite exactement où il en
  // était, sans trou ni doublon.
  useEffect(() => {
    try {
      depuisRef.current = localStorage.getItem(CLE_CURSEUR);
      const imprimesStockes = localStorage.getItem(CLE_IMPRIMES);
      if (imprimesStockes) idsImprimesRef.current = new Set(JSON.parse(imprimesStockes));
    } catch {
      // localStorage indisponible (navigation privée, etc.) : on continue
      // sans persistance, juste avec le comportement "démarre à maintenant".
    }

    let annule = false;

    async function verifier() {
      try {
        const params = depuisRef.current ? `?depuis=${encodeURIComponent(depuisRef.current)}` : "";
        const reponse = await fetch(`/api/caisse/nouvelles-commandes${params}`, { cache: "no-store" });
        if (!reponse.ok || annule) return;
        const data = await reponse.json();
        const nouvelles: CommandePourImpression[] = (data.commandes ?? []).filter(
          (c: CommandePourImpression) => !idsImprimesRef.current.has(c.id)
        );

        depuisRef.current = data.curseurSuivant;
        try {
          localStorage.setItem(CLE_CURSEUR, data.curseurSuivant);
        } catch {
          // ignore
        }

        if (nouvelles.length === 0 || annule) return;

        jouerAlerteSonore();
        // Séquentiel plutôt qu'en parallèle : évite de saturer les deux
        // imprimantes si plusieurs commandes en ligne arrivent groupées.
        for (const commande of nouvelles) {
          if (annule) return;
          idsImprimesRef.current.add(commande.id);
          await imprimerEtSignaler(commande);
        }

        try {
          const ids = [...idsImprimesRef.current].slice(-MAX_IDS_MEMORISES);
          idsImprimesRef.current = new Set(ids);
          localStorage.setItem(CLE_IMPRIMES, JSON.stringify(ids));
        } catch {
          // ignore
        }
      } catch {
        // Erreur réseau ponctuelle : sans conséquence, le prochain passage
        // de polling réessaiera.
      }
    }

    verifier();
    const intervalle = setInterval(verifier, INTERVALLE_POLLING_MS);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Même construction de sections que commande-publique-app.tsx (Tacos vs
  // Barquettes/Bowls distingués par nom, alternance rouge/vert par position,
  // "supplement" jamais affiché comme catégorie autonome — uniquement
  // accessible via les extras du configurateur).
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

  const total = panier.reduce((acc, l) => acc + (l.produit.prix ?? l.prixSaisi ?? 0) * l.quantite, 0);
  const livraisonPossible = parametres.zonesActives.length > 0;
  const minimumAtteint = total >= parametres.minimumCommande;
  const canalLivraisonBloque = canal === "livraison" && (!livraisonPossible || !minimumAtteint || !adresse.trim());
  const infosClientIncompletes = !nom.trim() || !telephone.trim();

  function ajouterAuPanier(
    produit: ProduitCaisse,
    viandesChoisies: string[],
    saucesChoisies: string[] = [],
    saveursChoisies: string[] = [],
    boissonIncluse: string | null = null,
    quantite: number = 1,
    prixSaisi?: number
  ) {
    setPanier((precedent) => {
      const cle = (l: LignePanier) =>
        l.produit.id === produit.id &&
        l.prixSaisi === prixSaisi &&
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
          prixSaisi,
        },
      ];
    });
  }

  function surClicProduit(produit: ProduitCaisse) {
    const besoinConfigurateur =
      (!produit.viandeImposee && produit.nbViandesMax > 0) ||
      produit.nbSaucesIncluses > 0 ||
      produit.autoriseExtras ||
      produit.nbSaveursMax > 0;

    if (besoinConfigurateur) {
      setProduitEnSelection(produit);
      return;
    }
    // Sinon (Grillades, Accompagnements, boisson à choix unique, "Plat du
    // jour" à prix libre) : QuantiteModalPublique demande le prix du jour
    // si besoin et laisse choisir la quantité, jamais d'ajout direct.
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
          clientTelephone: telephone.trim(),
          recompenseAppliquee: appliquerRecompense,
          creneauHeure,
          nom: nom.trim(),
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          lignes: panier.map((l) => ({
            produitId: l.produit.id,
            quantite: l.quantite,
            viandes: l.viandes,
            sauces: l.sauces,
            saveurs: l.saveurs,
            boissonIncluse: l.boissonIncluse,
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

      // Impression immédiate, sans bloquer l'écran de confirmation : une
      // imprimante non configurée ou hors ligne n'empêche jamais
      // l'encaissement (déjà enregistré à ce stade), juste un avertissement
      // discret (cf. imprimerEtSignaler).
      const lignesPourImpression: LigneCommande[] = panier.map((l) => ({
        produitId: l.produit.id,
        nom: l.produit.nom,
        categorie: l.produit.categorie,
        quantite: l.quantite,
        prixUnitaire: l.produit.prix ?? l.prixSaisi ?? 0,
        coutMatiereUnitaire: l.produit.coutMatiere,
        viandes: l.viandes,
        sauces: l.sauces,
        saveurs: l.saveurs,
        boissonIncluse: l.boissonIncluse,
        canetteIncluse: l.produit.canetteIncluse,
      }));
      imprimerEtSignaler({
        id: data.commandeId,
        numero: data.numero,
        canal,
        lignes: lignesPourImpression,
        montant: data.montant,
        modePaiement,
        nom: nom.trim(),
        adresse: canal === "livraison" ? adresse.trim() : null,
        heureSouhaitee: construireHeureSouhaiteeUtc(creneauHeure)?.toISOString() ?? null,
        creeLe: new Date().toISOString(),
        qrCode: canal === "livraison" ? (data.qrCode ?? null) : null,
      });

      setPanier([]);
      setTelephone("");
      setClientInfo(null);
      setAppliquerRecompense(false);
      setNom("");
      setAdresse("");
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (confirmation) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-bold text-gray-900">Commande encaissée ✅</p>
        <p className="text-gray-600">Montant : {confirmation.montant.toFixed(2)} €</p>
        <button
          onClick={() => setConfirmation(null)}
          className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white"
        >
          Nouvelle commande
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
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
                    className="flex w-full items-center justify-between rounded bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm active:bg-gray-50"
                  >
                    <span>{produit.nom}</span>
                    <span className="text-gray-400">
                      {produit.prix !== null ? `${produit.prix.toFixed(2)} €` : "Prix du jour"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {section.produits.map((produit) => (
                  <button
                    key={produit.id}
                    onClick={() => surClicProduit(produit)}
                    className="rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm active:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">{produit.nom}</div>
                    {produit.description && <div className="mt-0.5 text-xs text-gray-500">{produit.description}</div>}
                    <div className="mt-1 font-semibold text-gray-900">
                      {produit.prix !== null ? `${produit.prix.toFixed(2)} €` : "Prix du jour"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-500">Caissier·e : {nomEmploye}</p>
        <p className="text-xs text-gray-400">
          🖨️{" "}
          {imprimantes
            .map((i) => `${i.role === "comptoir" ? "Comptoir" : "Cuisine"} ${i.adresseIp ? "configurée" : "non configurée"}`)
            .join(" · ")}
        </p>
        {avertissementImpression && <p className="text-xs text-orange-600">⚠️ {avertissementImpression}</p>}

        <div>
          <h3 className="font-semibold text-gray-900">Panier</h3>
          {panier.length === 0 && <p className="text-sm text-gray-400">Vide.</p>}
          <ul className="mt-2 space-y-2">
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
                    className="rounded border border-gray-300 px-2 text-gray-700"
                  >
                    -
                  </button>
                  <span className="text-gray-900">{l.quantite}</span>
                  <button
                    onClick={() => modifierQuantite(l.id, 1)}
                    className="rounded border border-gray-300 px-2 text-gray-700"
                  >
                    +
                  </button>
                  <span className="ml-auto font-medium text-gray-900">
                    {((l.produit.prix ?? l.prixSaisi ?? 0) * l.quantite).toFixed(2)} €
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <label className="text-xs text-gray-500">Nom</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Téléphone</label>
          <div className="mt-1 flex gap-2">
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="0639..."
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
            />
            <button
              onClick={rechercherClient}
              disabled={rechercheEnCours}
              className="rounded border border-gray-300 px-3 text-sm text-gray-700"
            >
              🔍
            </button>
          </div>
          {clientInfo && (
            <div className="mt-2 text-xs text-gray-500">
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

        <div className="border-t border-gray-200 pt-3">
          <label className="text-xs text-gray-500">Comment récupérer la commande ?</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <button
              onClick={() => setCanal("sur_place")}
              className={`rounded border py-2 text-xs font-bold uppercase ${
                canal === "sur_place" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              Sur place
            </button>
            <button
              onClick={() => setCanal("emporter")}
              className={`rounded border py-2 text-xs font-bold uppercase ${
                canal === "emporter" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              À emporter
            </button>
            <button
              onClick={() => setCanal("livraison")}
              disabled={!livraisonPossible}
              className={`rounded border py-2 text-xs font-bold uppercase disabled:opacity-30 ${
                canal === "livraison" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              Livraison
            </button>
          </div>
          {canal === "livraison" && !minimumAtteint && (
            <p className="mt-2 text-xs text-orange-600">
              Minimum {parametres.minimumCommande.toFixed(2)} € pour la livraison — ajoute des articles ou choisis un
              autre canal.
            </p>
          )}
        </div>

        {canal === "livraison" && (
          <div className="space-y-3 border-t border-gray-200 pt-3">
            <div>
              <label className="text-xs text-gray-500">Adresse</label>
              <input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Zone</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
              >
                {parametres.zonesActives.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <CreneauPicker
          creneauxValides={creneauxValides}
          valeur={creneauHeure}
          onChange={setCreneauHeure}
          label={canal === "livraison" ? "Créneau de livraison souhaité" : "Heure de passage souhaitée"}
        />

        <div>
          <label className="text-xs text-gray-500">Paiement</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
            className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          >
            <option value="especes">Espèces</option>
            <option value="cb">Carte (SumUp)</option>
          </select>
        </div>

        <div className="border-t border-gray-200 pt-3 text-lg font-bold text-gray-900">
          Total :{" "}
          {(appliquerRecompense && clientInfo?.recompense_disponible ? Math.max(0, total - 10) : total).toFixed(2)} €
        </div>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          onClick={encaisser}
          disabled={panier.length === 0 || envoiEnCours || canalLivraisonBloque || infosClientIncompletes}
          className="w-full rounded bg-[#8B2020] py-3 font-semibold text-white disabled:opacity-40"
        >
          {envoiEnCours ? "Encaissement…" : "Encaisser"}
        </button>
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
          onValider={(quantite, prixSaisi) => {
            ajouterAuPanier(
              produitEnQuantite,
              produitEnQuantite.viandeImposee ? [produitEnQuantite.viandeImposee] : [],
              [],
              [],
              null,
              quantite,
              prixSaisi
            );
            setProduitEnQuantite(null);
          }}
        />
      )}
    </div>
  );
}
