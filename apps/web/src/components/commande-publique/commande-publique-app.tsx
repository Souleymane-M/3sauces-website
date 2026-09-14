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
  NOM_PRODUIT_SALADE_SUPPLEMENTAIRE,
} from "@/lib/commande-publique/types";
import { genererCreneaux, prochainCreneauValide } from "@/lib/commande-publique/creneau";
import { SEUIL_COMMANDE_PRIORITAIRE } from "@/lib/plats";
import { FooterLegal } from "@/components/legal/footer-legal";
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
  saladeIncluse: boolean | null;
}

/** Un "plat" en mode Commande groupée : conteneur explicite dans lequel le client range tout ce qu'il veut pour une personne — jamais déduit automatiquement du contenu. */
interface PlatGroupe {
  id: string;
  pourQui: string;
  lignes: LignePanierPublique[];
}

type ModeCommande = "simple" | "groupee" | null;

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

function platVide(numero: number): PlatGroupe {
  return { id: `plat-${numero}-${Date.now()}-${Math.random()}`, pourQui: "", lignes: [] };
}

export function CommandePubliqueApp({ produits, viandes, sauces, saveurs, parametres }: CommandePubliqueAppProps) {
  const router = useRouter();

  const creneauxValides = useMemo(
    () => genererCreneaux(parametres.heureDebut, parametres.heureFin),
    [parametres.heureDebut, parametres.heureFin]
  );

  // Deux structures parallèles, jamais fusionnées : le mode choisi détermine
  // laquelle est active. "Commande simple" = panier plat, restauré à
  // l'identique d'avant l'introduction des plats. "Commande groupée" = le
  // client construit lui-même chaque plat comme un conteneur explicite,
  // jamais de classification automatique par catégorie.
  const [modeCommande, setModeCommande] = useState<ModeCommande>(null);
  const [panierSimple, setPanierSimple] = useState<LignePanierPublique[]>([]);
  const [plats, setPlats] = useState<PlatGroupe[]>(() => [platVide(1)]);
  const [platDeplie, setPlatDeplie] = useState<string | null>(plats[0]?.id ?? null);

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
  const [accepteCgv, setAccepteCgv] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  // Ordre imposé : Menus spéciaux, Tacos, Barquettes & Bowls, Grillades,
  // puis Boissons en dernier (discrètes). "Tacos" et "Barquettes & Bowls"
  // partagent tous les deux la catégorie DB `snacking` — on les distingue
  // ici par le nom du produit plutôt que par une nouvelle catégorie, pour
  // ne pas complexifier le back-office pour un simple regroupement
  // d'affichage.
  //
  // Chaque section a désormais son bandeau de titre, en alternance stricte
  // rouge/vert d'une section à la suivante (jamais deux bandeaux de la même
  // couleur côte à côte) — couleur fixée à la position dans la liste plutôt
  // que par section elle-même, pour que l'alternance reste correcte même si
  // une section est absente (aucun produit actif dedans).
  //
  // Menus spéciaux + Plats du jour : bloc à part, rendu côte à côte juste
  // avant les autres sections (cf. JSX plus bas) — jamais dans la liste
  // alternée rouge/vert générique ci-dessous. L'ordre au sein de chaque
  // catégorie vient de `produits.ordre` (colonne configurable depuis
  // /patron) — déjà trié par la requête serveur, jamais recalculé ici.
  const menusSpeciaux = useMemo(() => produits.filter((p) => p.categorie === "menu_special"), [produits]);
  const platsDuJour = useMemo(() => produits.filter((p) => p.categorie === "plat_du_jour"), [produits]);

  const sections = useMemo<Section[]>(() => {
    const snacking = produits.filter((p) => p.categorie === "snacking");
    const tacos = snacking.filter((p) => p.nom.includes("Tacos") && !p.nom.includes("Bowl"));
    const barquettesBowls = snacking.filter((p) => p.nom.includes("Barquette") || p.nom.includes("Bowl"));

    const liste: Omit<Section, "couleur">[] = [
      { key: "tacos", titre: "Tacos", produits: tacos },
      { key: "barquettes_bowls", titre: "Barquettes & Bowls", produits: barquettesBowls },
      { key: "grillade", titre: "Grillades", produits: produits.filter((p) => p.categorie === "grillade") },
      {
        key: "accompagnement",
        titre: "Accompagnements",
        produits: produits.filter((p) => p.categorie === "accompagnement"),
      },
      { key: "boisson", titre: "Boissons", discret: true, produits: produits.filter((p) => p.categorie === "boisson") },
    ];
    // Le bloc Menus/Plats du jour ci-dessus occupe déjà 1 bandeau (Menus
    // seul) ou 2 (Menus + Plats du jour) — on décale la première couleur
    // ici pour ne jamais avoir deux bandeaux de la même couleur qui se
    // suivent visuellement.
    const decalage = (menusSpeciaux.length > 0 ? 1 : 0) + (platsDuJour.length > 0 ? 1 : 0);
    return liste
      .filter((s) => s.produits.length > 0)
      .map((s, i) => ({ ...s, couleur: (i + decalage) % 2 === 0 ? "rouge" : "vert" }));
  }, [produits, menusSpeciaux, platsDuJour]);

  const couleurMenus = ROUGE;
  const couleurPlatsDuJour = menusSpeciaux.length > 0 ? VERT : ROUGE;

  const produitViandeSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  const produitSauceSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  const produitSaladeSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_SALADE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );

  const platActif = plats[plats.length - 1];
  // Un plat fraîchement ouvert et encore vide ne compte pas — seulement
  // ceux dans lesquels le client a effectivement mis quelque chose.
  const nbPlatsValides = plats.filter((p) => p.lignes.length > 0).length;

  const panierActuel = modeCommande === "groupee" ? plats.flatMap((p) => p.lignes) : panierSimple;
  const total = panierActuel.reduce((acc, l) => acc + l.produit.prix * l.quantite, 0);
  const nbArticles = panierActuel.reduce((acc, l) => acc + l.quantite, 0);

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

  /**
   * Point d'entrée unique pour ajouter un article — écrit dans le panier
   * plat (mode simple) ou dans les lignes du plat actif, toujours le
   * dernier de la liste (mode groupé). Aucun article ne peut jamais
   * "flotter" hors d'un plat en mode groupé : tout ajout part forcément
   * dans le plat actif du moment.
   */
  function ajouterAuPanier(
    produit: ProduitPublic,
    viandesChoisies: string[],
    saucesChoisies: string[] = [],
    saveursChoisies: string[] = [],
    boissonIncluse: string | null = null,
    quantite: number = 1,
    saladeIncluse: boolean | null = null
  ) {
    declencherPulse();
    const cle = (l: LignePanierPublique) =>
      l.produit.id === produit.id &&
      JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort()) &&
      JSON.stringify([...l.sauces].sort()) === JSON.stringify([...saucesChoisies].sort()) &&
      JSON.stringify([...l.saveurs].sort()) === JSON.stringify([...saveursChoisies].sort()) &&
      l.boissonIncluse === boissonIncluse &&
      l.saladeIncluse === saladeIncluse;
    const nouvelleLigne = (): LignePanierPublique => ({
      id: `${produit.id}-${Date.now()}-${Math.random()}`,
      produit,
      quantite,
      viandes: viandesChoisies,
      sauces: saucesChoisies,
      saveurs: saveursChoisies,
      boissonIncluse,
      saladeIncluse,
    });

    if (modeCommande === "groupee") {
      setPlats((precedent) => {
        const copie = [...precedent];
        const actif = copie[copie.length - 1];
        const existante = actif.lignes.find(cle);
        const lignes = existante
          ? actif.lignes.map((l) => (l === existante ? { ...l, quantite: l.quantite + quantite } : l))
          : [...actif.lignes, nouvelleLigne()];
        copie[copie.length - 1] = { ...actif, lignes };
        return copie;
      });
      setPlatDeplie(platActif.id);
      return;
    }

    setPanierSimple((precedent) => {
      const existante = precedent.find(cle);
      if (existante) {
        return precedent.map((l) => (l === existante ? { ...l, quantite: l.quantite + quantite } : l));
      }
      return [...precedent, nouvelleLigne()];
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
    if (modeCommande === "groupee") {
      setPlats((precedent) =>
        precedent.map((plat) => ({
          ...plat,
          lignes: plat.lignes
            .map((l) => (l.id === id ? { ...l, quantite: l.quantite + delta } : l))
            .filter((l) => l.quantite > 0),
        }))
      );
      return;
    }
    setPanierSimple((precedent) =>
      precedent.map((l) => (l.id === id ? { ...l, quantite: l.quantite + delta } : l)).filter((l) => l.quantite > 0)
    );
  }

  function retirerLigne(id: string) {
    if (modeCommande === "groupee") {
      setPlats((precedent) => precedent.map((plat) => ({ ...plat, lignes: plat.lignes.filter((l) => l.id !== id) })));
      return;
    }
    setPanierSimple((precedent) => precedent.filter((l) => l.id !== id));
  }

  function platSuivant() {
    setPlats((precedent) => {
      const nouveau = platVide(precedent.length + 1);
      setPlatDeplie(nouveau.id);
      return [...precedent, nouveau];
    });
  }

  function modifierPourQuiPlat(platId: string, valeur: string) {
    setPlats((precedent) => precedent.map((p) => (p.id === platId ? { ...p, pourQui: valeur } : p)));
  }

  function supprimerPlat(platId: string) {
    setPlats((precedent) => (precedent.length > 1 ? precedent.filter((p) => p.id !== platId) : precedent));
  }

  function voirPanier() {
    document.getElementById("panier-recap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const canalLivraisonBloque = canal === "livraison" && (!livraisonPossible || !minimumAtteint);

  async function commander() {
    setErreur(null);

    if (nbArticles === 0) {
      setErreur("Ton panier est vide.");
      return;
    }
    if (modeCommande === "groupee" && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE) {
      setErreur("Ajoutez au moins 3 plats pour une commande groupée, ou repassez en commande simple.");
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
    if (!accepteCgv) {
      setErreur("Tu dois accepter les CGV et la politique de confidentialité.");
      return;
    }

    setEnvoiEnCours(true);
    try {
      const lignes =
        modeCommande === "groupee"
          ? plats.flatMap((plat, index) =>
              plat.lignes.map((l) => ({
                produitId: l.produit.id,
                quantite: l.quantite,
                viandes: l.viandes,
                sauces: l.sauces,
                saveurs: l.saveurs,
                boissonIncluse: l.boissonIncluse,
                saladeIncluse: l.saladeIncluse,
                platIndex: index,
                pourQui: plat.pourQui.trim() || null,
              }))
            )
          : panierSimple.map((l) => ({
              produitId: l.produit.id,
              quantite: l.quantite,
              viandes: l.viandes,
              sauces: l.sauces,
              saveurs: l.saveurs,
              boissonIncluse: l.boissonIncluse,
              saladeIncluse: l.saladeIncluse,
              platIndex: null,
              pourQui: null,
            }));

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
          consentementCgv: accepteCgv,
          lignes,
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

  /** Rendu d'une ligne de panier — identique en mode simple et à l'intérieur d'un plat déplié en mode groupé. */
  function ligneJsx(l: LignePanierPublique) {
    return (
      <li key={l.id} className="text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-900">{l.produit.nom}</span>
          <button onClick={() => retirerLigne(l.id)} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>
        {l.viandes.length > 0 && <div className="text-xs text-gray-500">{l.viandes.join(", ")}</div>}
        {l.saveurs.length > 0 && <div className="text-xs text-gray-500">{l.saveurs.join(", ")}</div>}
        {l.sauces.length > 0 && <div className="text-xs text-gray-400">Sauces : {l.sauces.join(", ")}</div>}
        {l.boissonIncluse && <div className="text-xs text-gray-400">Boisson incluse : {l.boissonIncluse}</div>}
        {l.saladeIncluse !== null && (
          <div className="text-xs text-gray-400">{l.saladeIncluse ? "Avec salade" : "Sans salade"}</div>
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
          <span className="ml-auto font-medium text-gray-900">{(l.produit.prix * l.quantite).toFixed(2)} €</span>
        </div>
      </li>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: FOND_PAGE }}>
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <div className="rounded-lg p-3 text-white" style={{ backgroundColor: VERT }}>
          <p className="font-bold">🚀 Commande groupée = livraison prioritaire</p>
          <p className="mt-0.5 text-sm text-white/90">
            Ajoutez 3 plats ou plus à votre commande — livrés en priorité, sans rien payer de plus.
          </p>
        </div>

        {modeCommande === null ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-center font-semibold text-gray-900">Vous commandez pour vous, ou en groupe ?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModeCommande("simple")}
                className="rounded border border-gray-300 py-3 text-sm font-bold uppercase text-gray-700 active:bg-gray-50"
              >
                Commande simple
              </button>
              <button
                onClick={() => setModeCommande("groupee")}
                className="rounded bg-[#8B2020] py-3 text-sm font-bold uppercase text-white"
              >
                Commande groupée
              </button>
            </div>
          </div>
        ) : (
          <>
            {modeCommande === "groupee" && (
              <div className="rounded-lg border border-[#8B2020] bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">
                  Tu remplis actuellement : <span className="text-[#8B2020]">Plat {plats.length}</span>
                  {platActif.pourQui ? ` (${platActif.pourQui})` : ""}
                </p>
                <button
                  type="button"
                  onClick={platSuivant}
                  disabled={platActif.lignes.length === 0}
                  className="mt-2 w-full rounded bg-[#2D5A27] py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Plat suivant →
                </button>
              </div>
            )}

            <div className="space-y-6">
              {(menusSpeciaux.length > 0 || platsDuJour.length > 0) && (
                <div className={menusSpeciaux.length > 0 && platsDuJour.length > 0 ? "grid grid-cols-2 gap-3" : ""}>
                  {menusSpeciaux.length > 0 && (
                    <div>
                      <div
                        className="mb-2 rounded px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white"
                        style={{ backgroundColor: couleurMenus }}
                      >
                        Menus Spéciaux
                      </div>
                      <div className="flex flex-col gap-2">
                        {menusSpeciaux.map((produit) => (
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
                    </div>
                  )}

                  {platsDuJour.length > 0 && (
                    <div>
                      <div
                        className="mb-2 rounded px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white"
                        style={{ backgroundColor: couleurPlatsDuJour }}
                      >
                        Plats du jour
                      </div>
                      <div className="flex flex-col gap-2">
                        {platsDuJour.map((produit) => (
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
                    </div>
                  )}
                </div>
              )}

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

              {modeCommande === "simple" ? (
                <>
                  {panierSimple.length === 0 && <p className="text-sm text-gray-400">Vide.</p>}
                  <ul className="space-y-2">{panierSimple.map(ligneJsx)}</ul>
                </>
              ) : (
                <>
                  {nbArticles === 0 && <p className="text-sm text-gray-400">Vide.</p>}
                  <ul className="space-y-2">
                    {plats.map((plat, index) => {
                      if (plat.lignes.length === 0) return null;
                      const totalPlat = plat.lignes.reduce((acc, l) => acc + l.produit.prix * l.quantite, 0);
                      const nbArticlesPlat = plat.lignes.reduce((acc, l) => acc + l.quantite, 0);
                      const deplie = platDeplie === plat.id;
                      return (
                        <li key={plat.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                          <button
                            type="button"
                            onClick={() => setPlatDeplie(deplie ? null : plat.id)}
                            className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-gray-900"
                          >
                            <span>
                              Plat {index + 1}
                              {plat.pourQui ? ` — ${plat.pourQui}` : ""} — {nbArticlesPlat} article
                              {nbArticlesPlat > 1 ? "s" : ""} — {totalPlat.toFixed(2)} €
                            </span>
                            <span className="text-gray-400">{deplie ? "▲" : "▼"}</span>
                          </button>

                          {deplie && (
                            <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                              <input
                                value={plat.pourQui}
                                onChange={(e) => modifierPourQuiPlat(plat.id, e.target.value)}
                                placeholder="Pour qui ? (optionnel)"
                                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                              />
                              <ul className="space-y-2">{plat.lignes.map(ligneJsx)}</ul>
                              {plats.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => supprimerPlat(plat.id)}
                                  className="text-xs text-red-500 underline"
                                >
                                  Supprimer ce plat
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {nbPlatsValides > 0 && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE && (
                    <p className="text-sm font-semibold text-[#2D5A27]">
                      {SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides === 1
                        ? "Plus qu'un plat pour la livraison prioritaire 🚀"
                        : `Plus que ${SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides} plats pour la livraison prioritaire 🚀`}
                    </p>
                  )}
                  {nbPlatsValides >= SEUIL_COMMANDE_PRIORITAIRE && (
                    <p className="text-sm font-bold text-[#2D5A27]">🚀 Livraison prioritaire activée !</p>
                  )}
                </>
              )}

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
                    Minimum {parametres.minimumCommande.toFixed(2)} € pour la livraison — ajoute des articles ou
                    choisis le retrait sur place.
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

              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={accepteCgv}
                  onChange={(e) => setAccepteCgv(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  J&apos;accepte les{" "}
                  <a href="/cgv" target="_blank" rel="noopener noreferrer" className="underline">
                    CGV
                  </a>{" "}
                  et la{" "}
                  <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="underline">
                    politique de confidentialité
                  </a>
                  .
                </span>
              </label>

              {erreur && <p className="text-sm text-red-600">{erreur}</p>}

              <button
                onClick={commander}
                disabled={
                  envoiEnCours ||
                  canalLivraisonBloque ||
                  !accepteCgv ||
                  nbArticles === 0 ||
                  (modeCommande === "groupee" && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE)
                }
                className="w-full rounded bg-[#8B2020] py-3 font-semibold text-white disabled:opacity-40"
              >
                {envoiEnCours ? "Envoi…" : "Commander"}
              </button>
            </div>

            <FooterLegal />
          </>
        )}
      </div>

      {modeCommande !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            {nbArticles === 0 ? (
              <span className="text-sm text-gray-400">Ton panier est vide</span>
            ) : (
              <>
                <div className={`transition-transform duration-200 ${pulse ? "scale-110" : "scale-100"}`}>
                  <div className="text-sm font-semibold text-gray-900">
                    {modeCommande === "groupee"
                      ? `${nbPlatsValides} plat${nbPlatsValides > 1 ? "s" : ""}`
                      : `${nbArticles} article${nbArticles > 1 ? "s" : ""}`}
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
      )}

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
          onValider={(viandesChoisies, saucesChoisies, extras, boissonIncluse, saladeIncluse, saladeOption) => {
            ajouterAuPanier(produitEnSelection, viandesChoisies, saucesChoisies, [], boissonIncluse, 1, saladeIncluse);
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
            if (saladeOption && produitSaladeSupplementaire) {
              ajouterAuPanier(produitSaladeSupplementaire, [], []);
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
