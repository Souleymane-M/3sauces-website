"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Canal, ModePaiement } from "@3sauces/supabase";
import type { ProduitCaisse, ViandeCaisse, SauceCaisse, SaveurCaisse, LigneCommande } from "@/lib/caisse/types";
import type { CommandeAModifier } from "@/lib/caisse/modification";
import type { ParametresLivraisonPublic } from "@/lib/commande-publique/types";
import {
  NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE,
  NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE,
  NOM_PRODUIT_SALADE_SUPPLEMENTAIRE,
  NOM_PRODUIT_MENU_ETUDIANT,
  MONTANT_REDUCTION_SANS_BOISSON,
} from "@/lib/commande-publique/types";
import {
  genererCreneaux,
  prochainCreneauValide,
  construireHeureSouhaiteeUtc,
  heureActuelleMayotteMinutes,
} from "@/lib/commande-publique/creneau";
import { ViandeModalPublique } from "@/components/commande-publique/viande-modal-publique";
import { SaveurModalPublique } from "@/components/commande-publique/saveur-modal-publique";
import { QuantiteModalPublique } from "@/components/commande-publique/quantite-modal-publique";
import { VitrineModalPublique, type ChoixVitrine } from "@/components/commande-publique/vitrine-modal-publique";
import { CreneauPicker } from "@/components/commande-publique/creneau-picker";
import type { ImprimanteAdmin } from "@/lib/patron/imprimantes-types";
import type { CommandePourImpression, ConfigImprimante } from "@/lib/impression/types";
import { imprimerCommande, type ConfigImprimantes } from "@/lib/impression/imprimer-commande";
import { jouerAlerteSonore } from "@/lib/impression/alerte-sonore";
import { SEUIL_COMMANDE_PRIORITAIRE, SEUIL_MINIMUM_PLAT } from "@/lib/plats";
import {
  MONTANT_RECOMPENSE,
  SEUIL_RECOMPENSE,
  messageFidelite,
  progressionFideliteCommande,
  texteProgressionFidelite,
} from "@/lib/fidelite/regles";
import { piecesParPaquet, nomSansMultiplicateur, nomPluriel } from "@/lib/pieces-produit";
import {
  SEUIL_GROUPE_3_MONTANT,
  SEUIL_GROUPE_4_MONTANT,
  NOM_PRODUIT_BOISSON_OFFERTE,
  palierGroupeActif,
  palierGroupeSelonQuantite,
  messageProgressionBoissonOfferte,
} from "@/lib/commande-publique/groupe-priorite";

interface LignePanier {
  id: string;
  produit: ProduitCaisse;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
  sansBoisson: boolean;
  prixSaisi?: number;
  saladeIncluse: boolean | null;
  accompagnementsInclus: string[];
}

/** Un "plat" en mode Commande groupée : conteneur explicite dans lequel l'employé range tout ce que le client décrit pour une personne — jamais déduit automatiquement du contenu. */
interface PlatGroupeCaisse {
  id: string;
  pourQui: string;
  lignes: LignePanier[];
}

type ModeCommande = "simple" | "groupee" | null;

interface CaisseAppProps {
  produits: ProduitCaisse[];
  viandes: ViandeCaisse[];
  sauces: SauceCaisse[];
  saveurs: SaveurCaisse[];
  /** Parfums de la Boisson 2L — référentiel indépendant de `saveurs` (canettes), cf. lib/patron/options.ts. */
  parfums2l: SaveurCaisse[];
  parametres: ParametresLivraisonPublic;
  imprimantesInitiales: ImprimanteAdmin[];
  nomEmploye: string;
  /** Présent uniquement quand /caisse est ouvert via `?modifier=<id>` — bascule tout l'écran en mode édition d'une commande déjà "en_attente" plutôt qu'en prise de commande. */
  commandeExistante?: CommandeAModifier | null;
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

/**
 * sessionStorage (pas localStorage) : le panier en cours doit survivre à un
 * rechargement accidentel de l'iPad, mais jamais réapparaître le lendemain
 * ou dans un autre onglet.
 */
const CLE_PANIER_CAISSE = "3sauces_caisse_panier";

interface ClientInfo {
  existe: boolean;
  telephone: string;
  montant_cumule?: number;
  tampons_acquis?: number;
  recompense_disponible?: boolean;
  date_expiration?: string | null;
}

function platVide(numero: number): PlatGroupeCaisse {
  return { id: `plat-${numero}-${Date.now()}-${Math.random()}`, pourQui: "", lignes: [] };
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
 *
 * Même écran de choix "Commande simple / Commande groupée" qu'au site
 * public, systématique : un client au comptoir peut tout aussi bien
 * commander pour un groupe et se faire livrer — ce n'est jamais une
 * question de canal de prise de commande, seulement du nombre de plats.
 */
export function CaisseApp({
  produits,
  viandes,
  sauces,
  saveurs,
  parfums2l,
  parametres,
  imprimantesInitiales,
  nomEmploye,
  commandeExistante,
}: CaisseAppProps) {
  const router = useRouter();
  const enModeEdition = commandeExistante != null;

  /**
   * Convertit une ligne persistée (`commandes.contenu`) en ligne de panier en
   * retrouvant le produit courant du catalogue. La ligne "Boisson 2L
   * (offerte)" est exclue : elle est régénérée automatiquement côté serveur
   * selon le palier groupée recalculé, jamais éditée à la main.
   */
  function ligneDepuisCommande(l: LigneCommande): LignePanier | null {
    if (l.nom === NOM_PRODUIT_BOISSON_OFFERTE) return null;
    const produit = produits.find((p) => p.id === l.produitId);
    if (!produit) return null;
    return {
      id: `${l.produitId}-${Date.now()}-${Math.random()}`,
      produit,
      quantite: l.quantite,
      viandes: l.viandes,
      sauces: l.sauces ?? [],
      saveurs: l.saveurs ?? [],
      boissonIncluse: l.boissonIncluse ?? null,
      sansBoisson: l.sansBoisson ?? false,
      prixSaisi: produit.prix === null ? l.prixUnitaire : undefined,
      saladeIncluse: l.saladeIncluse ?? null,
      accompagnementsInclus: l.accompagnementsInclus ?? [],
    };
  }

  const [modeCommande, setModeCommande] = useState<ModeCommande>(() => {
    if (!enModeEdition) return null;
    return commandeExistante.lignes.some((l) => l.platIndex !== null) ? "groupee" : "simple";
  });
  const [panierSimple, setPanierSimple] = useState<LignePanier[]>(() => {
    if (!enModeEdition) return [];
    return commandeExistante.lignes
      .filter((l) => l.platIndex === null)
      .map(ligneDepuisCommande)
      .filter((l): l is LignePanier => l !== null);
  });
  const [plats, setPlats] = useState<PlatGroupeCaisse[]>(() => {
    if (enModeEdition) {
      const parIndex = new Map<number, LigneCommande[]>();
      for (const l of commandeExistante.lignes) {
        if (l.platIndex === null) continue;
        const liste = parIndex.get(l.platIndex) ?? [];
        liste.push(l);
        parIndex.set(l.platIndex, liste);
      }
      if (parIndex.size > 0) {
        return [...parIndex.entries()]
          .sort(([a], [b]) => a - b)
          .map(([index, lignesBrutes]) => ({
            id: `plat-${index}-${Date.now()}-${Math.random()}`,
            pourQui: lignesBrutes[0]?.pourQui ?? "",
            lignes: lignesBrutes.map(ligneDepuisCommande).filter((l): l is LignePanier => l !== null),
          }));
      }
    }
    return [platVide(1)];
  });
  const [platDeplie, setPlatDeplie] = useState<string | null>(plats[0]?.id ?? null);
  const [platActifId, setPlatActifId] = useState<string>(plats[0].id);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitCaisse | null>(null);
  const [produitEnQuantite, setProduitEnQuantite] = useState<ProduitCaisse | null>(null);
  const [vitrineOuverte, setVitrineOuverte] = useState(false);
  // Ligne du panier pour laquelle le client vient de changer d'avis sur une
  // formule passée en "Sans boisson" : ouvre un choix de saveur si plusieurs
  // sont possibles, sinon appliqué directement.
  const [ligneCorrectionBoisson, setLigneCorrectionBoisson] = useState<LignePanier | null>(null);
  const [canal, setCanal] = useState<Canal>(() => commandeExistante?.canal ?? "sur_place");
  const [boissonOfferteSaveur, setBoissonOfferteSaveur] = useState<string | null>(null);

  // Restauration du panier après un rechargement accidentel de l'iPad : on
  // ne persiste qu'après cette première lecture (`pretPourPersistance`),
  // sinon le tout premier effet d'écriture, qui s'exécute avant que les
  // `setState` de restauration ci-dessous n'aient été pris en compte,
  // écraserait le panier sauvegardé avec un panier vide. En mode édition, on
  // ignore entièrement ce mécanisme : ni lecture (le panier vient de la
  // commande à modifier, jamais d'un panier comptoir resté en session), ni
  // écriture (on ne veut pas polluer le panier comptoir normal avec le
  // contenu en cours d'édition).
  const [pretPourPersistance, setPretPourPersistance] = useState(false);
  useEffect(() => {
    if (enModeEdition) return;
    // Différé en microtâche : lire sessionStorage et restaurer l'état sont
    // deux opérations distinctes, jamais un simple calcul synchrone de
    // rendu — le report en microtâche évite les rendus en cascade au
    // montage tout en gardant la restauration quasi instantanée.
    queueMicrotask(() => {
      try {
        const brut = sessionStorage.getItem(CLE_PANIER_CAISSE);
        if (brut) {
          const etat = JSON.parse(brut);
          if (etat.modeCommande !== undefined) setModeCommande(etat.modeCommande);
          if (Array.isArray(etat.panierSimple)) setPanierSimple(etat.panierSimple);
          if (Array.isArray(etat.plats) && etat.plats.length > 0) setPlats(etat.plats);
          if (etat.platDeplie !== undefined) setPlatDeplie(etat.platDeplie);
          if (etat.platActifId) setPlatActifId(etat.platActifId);
          if (etat.canal) setCanal(etat.canal);
          if (etat.boissonOfferteSaveur !== undefined) setBoissonOfferteSaveur(etat.boissonOfferteSaveur);
        }
      } catch {
        // sessionStorage indisponible ou contenu corrompu : on repart d'un panier vide, jamais bloquant.
      }
      setPretPourPersistance(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enModeEdition || !pretPourPersistance) return;
    try {
      sessionStorage.setItem(
        CLE_PANIER_CAISSE,
        JSON.stringify({ modeCommande, panierSimple, plats, platDeplie, platActifId, canal, boissonOfferteSaveur })
      );
    } catch {
      // Stockage plein ou indisponible : la session continue simplement sans persistance.
    }
  }, [
    enModeEdition,
    pretPourPersistance,
    modeCommande,
    panierSimple,
    plats,
    platDeplie,
    platActifId,
    canal,
    boissonOfferteSaveur,
  ]);

  const [modePaiement, setModePaiement] = useState<ModePaiement>(() => commandeExistante?.modePaiement ?? "especes");
  const [telephone, setTelephone] = useState(() => commandeExistante?.telephone ?? "");
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [appliquerRecompense, setAppliquerRecompense] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Erreur spécifique à la navigation entre plats (seuil de 5€ non atteint) —
  // séparée de `erreur` (formulaire, tout en bas) pour s'afficher juste
  // au-dessus du bouton "Plat suivant".
  const [erreurPlat, setErreurPlat] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ commandeId: string; montant: number; canal: Canal } | null>(
    null
  );

  // Créneau souhaité pour tous les canaux (comme le site public : "Heure de
  // passage souhaitée" pour sur place/à emporter, "Créneau de livraison
  // souhaité" pour la livraison) ; adresse/zone restent propres à la
  // livraison. Nom et téléphone sont obligatoires pour tous les canaux,
  // comme sur le site public.
  const creneauxValides = useMemo(
    () => genererCreneaux(parametres.heureDebut, parametres.heureFin),
    [parametres.heureDebut, parametres.heureFin]
  );
  const [creneauHeure, setCreneauHeure] = useState(
    () => commandeExistante?.creneauHeure || prochainCreneauValide(creneauxValides)
  );
  const [nom, setNom] = useState(() => commandeExistante?.nom ?? "");
  const [adresse, setAdresse] = useState(() => commandeExistante?.adresse ?? "");
  const [zone, setZone] = useState(() => commandeExistante?.zone ?? parametres.zonesActives[0] ?? "");

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

  /**
   * Impression différée (commande à l'avance dont le jour est arrivé) : ne
   * marque `ticket_imprime_le` qu'en cas de succès confirmé — un échec
   * (imprimante hors ligne) laisse le flag à null, pour que le prochain
   * cycle de polling (7s) retente automatiquement, sans jamais perdre la
   * commande silencieusement.
   */
  async function imprimerPuisMarquer(commande: CommandePourImpression) {
    const liste = await recupererImprimantes();
    const resultat = await imprimerCommande(commande, versConfigImprimantes(liste));
    const echecComptoir = resultat.comptoir !== null && !resultat.comptoir.ok;
    const echecCuisine = resultat.cuisine !== null && !resultat.cuisine.ok;

    if (echecComptoir || echecCuisine) {
      const messages: string[] = [];
      if (echecComptoir && resultat.comptoir && !resultat.comptoir.ok) messages.push(`Comptoir : ${resultat.comptoir.erreur}`);
      if (echecCuisine && resultat.cuisine && !resultat.cuisine.ok) messages.push(`Cuisine : ${resultat.cuisine.erreur}`);
      setAvertissementImpression(messages.join(" · "));
      return;
    }

    try {
      await fetch("/api/caisse/commandes-a-imprimer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: commande.id }),
      });
    } catch {
      // Le marquage échoue mais l'impression a réussi : sans conséquence
      // grave (au pire une réimpression au prochain cycle), jamais bloquant.
    }
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

        if (nouvelles.length > 0 && !annule) {
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
        }
      } catch {
        // Erreur réseau ponctuelle : sans conséquence, le prochain passage
        // de polling réessaiera.
      }

      // Second volet, indépendant du curseur ci-dessus : commandes à
      // l'avance dont le jour de retrait est arrivé, jamais encore
      // imprimées. Toujours vérifié à chaque cycle, même si aucune nouvelle
      // commande classique n'a été détectée.
      try {
        const reponseDifferees = await fetch(
          `/api/caisse/commandes-a-imprimer?heureDebut=${encodeURIComponent(parametres.heureDebut)}`,
          { cache: "no-store" }
        );
        if (!reponseDifferees.ok || annule) return;
        const dataDifferees = await reponseDifferees.json();
        const differees: CommandePourImpression[] = dataDifferees.commandes ?? [];
        if (differees.length === 0 || annule) return;

        jouerAlerteSonore();
        for (const commande of differees) {
          if (annule) return;
          await imprimerPuisMarquer(commande);
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
    // Insensible à la casse : un nom saisi tout en majuscules depuis /patron
    // (ex: "TACOS DU CHEF") ne doit jamais disparaître silencieusement de
    // toute la page faute de correspondance exacte.
    const nomMinuscule = (p: (typeof snacking)[number]) => p.nom.toLowerCase();
    const tacos = snacking.filter((p) => nomMinuscule(p).includes("tacos") && !nomMinuscule(p).includes("bowl"));
    const barquettesBowls = snacking.filter(
      (p) => nomMinuscule(p).includes("barquette") || nomMinuscule(p).includes("bowl")
    );

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
  const produitSaladeSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_SALADE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  // Accompagnements proposés en choix gratuit inclus (Plats du jour) —
  // jamais "Salade", qui est incluse automatiquement sans choix quand elle
  // fait partie de la recette (pas le même mécanisme que ce choix libre).
  const accompagnements = useMemo(
    () => produits.filter((p) => p.categorie === "accompagnement" && p.nom !== "Salade"),
    [produits]
  );
  // Boisson en ajout rapide dans la fenêtre "Plats du jour" (jamais la
  // Boisson 2L offerte, un produit synthétique distinct) — identifié par
  // structure (boisson à choix de saveur), jamais par nom en dur.
  const produitCanetteRapide = useMemo(
    () => produits.find((p) => p.categorie === "boisson" && p.nbSaveursMax > 0 && p.nom !== NOM_PRODUIT_BOISSON_OFFERTE) ?? null,
    [produits]
  );

  const enModeGroupe = modeCommande === "groupee";
  const platActif = plats.find((p) => p.id === platActifId) ?? plats[plats.length - 1];
  // Prix effectif d'une ligne : prix catalogue (ou saisi pour un plat du jour
  // à prix libre), plus la boisson formule si demandée — uniquement pour les
  // produits à canette incluse (Tacos/Barquette/Bowl), jamais les autres.
  const prixLigne = (l: LignePanier) =>
    (l.produit.prix ?? l.prixSaisi ?? 0) + (l.produit.canetteIncluse && !l.sansBoisson ? MONTANT_REDUCTION_SANS_BOISSON : 0);
  const totalPlat = (plat: PlatGroupeCaisse) => plat.lignes.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const nbPlatsValides = plats.filter((p) => p.lignes.length > 0).length;

  const panierActuel = enModeGroupe ? plats.flatMap((p) => p.lignes) : panierSimple;
  const total = panierActuel.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const livraisonPossible = parametres.zonesActives.length > 0;
  const minimumAtteint = total >= parametres.minimumCommande;
  const palierGroupeReel = palierGroupeActif(nbPlatsValides, total, heureActuelleMayotteMinutes());
  // Panier suffisant en quantité/montant mais avantage bloqué par l'heure
  // (après 11h) — message dédié, distinct de "il manque des plats/€".
  const groupeTropTard = palierGroupeReel === null && palierGroupeSelonQuantite(nbPlatsValides, total) !== null;
  const canalLivraisonBloque = canal === "livraison" && (!livraisonPossible || !minimumAtteint || !adresse.trim());

  // Dérivé plutôt que synchronisé par effet : si le panier repasse sous le
  // minimum après avoir coché la case (ex: article retiré), la récompense
  // cesse d'être appliquée sans attendre un second rendu.
  const appliquerRecompenseEffectif = appliquerRecompense && total >= MONTANT_RECOMPENSE;
  const infosClientIncompletes = !nom.trim() || !telephone.trim();

  /** Revient à l'écran de choix "Commande simple / Commande groupée" — vide le panier en cours (avec confirmation s'il n'est pas vide) puisque les deux modes ne partagent pas la même structure de panier. */
  function retourChoixMode() {
    if (panierActuel.length > 0 && !window.confirm("Changer de mode videra le panier en cours. Continuer ?")) {
      return;
    }
    setModeCommande(null);
    setPanierSimple([]);
    const initial = platVide(1);
    setPlats([initial]);
    setPlatActifId(initial.id);
    setPlatDeplie(null);
    setErreurPlat(null);
  }

  /**
   * Point d'entrée unique pour ajouter un article — écrit dans les lignes
   * du plat ciblé par `platActifId` en mode "Commande groupée" (pas
   * forcément le dernier du tableau : "Modifier" peut rediriger vers un
   * plat déjà fermé), ou dans le panier plat sinon (mode "Commande
   * simple"). Aucun article ne peut jamais "flotter" hors d'un plat en
   * mode groupé.
   */
  function ajouterAuPanier(
    produit: ProduitCaisse,
    viandesChoisies: string[],
    saucesChoisies: string[] = [],
    saveursChoisies: string[] = [],
    boissonIncluse: string | null = null,
    quantite: number = 1,
    prixSaisi?: number,
    saladeIncluse: boolean | null = null,
    accompagnementsInclus: string[] = [],
    sansBoisson: boolean = false
  ) {
    const cle = (l: LignePanier) =>
      l.produit.id === produit.id &&
      l.prixSaisi === prixSaisi &&
      JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort()) &&
      JSON.stringify([...l.sauces].sort()) === JSON.stringify([...saucesChoisies].sort()) &&
      JSON.stringify([...l.saveurs].sort()) === JSON.stringify([...saveursChoisies].sort()) &&
      l.boissonIncluse === boissonIncluse &&
      l.sansBoisson === sansBoisson &&
      l.saladeIncluse === saladeIncluse &&
      JSON.stringify([...l.accompagnementsInclus].sort()) === JSON.stringify([...accompagnementsInclus].sort());
    const nouvelleLigne = (): LignePanier => ({
      id: `${produit.id}-${Date.now()}-${Math.random()}`,
      produit,
      quantite,
      viandes: viandesChoisies,
      sauces: saucesChoisies,
      saveurs: saveursChoisies,
      boissonIncluse,
      sansBoisson,
      prixSaisi,
      saladeIncluse,
      accompagnementsInclus,
    });

    // Avertit plutôt que d'ajuster silencieusement — un ajout refusé ou
    // réduit sans explication ressemblerait à un bug côté caisse.
    const stockRestantAvantAjout = produit.stockJour !== null ? plafonnerQuantite(produit, null, produit.stockJour) : null;
    if (stockRestantAvantAjout !== null && quantite > stockRestantAvantAjout) {
      window.alert(
        stockRestantAvantAjout > 0
          ? `Il ne reste que ${stockRestantAvantAjout} ${produit.nom} disponible(s) aujourd'hui (déjà dans le panier compris).`
          : `${produit.nom} est épuisé pour aujourd'hui, ou déjà entièrement dans le panier.`
      );
    }

    if (enModeGroupe) {
      setErreurPlat(null);
      setPlats((precedent) => {
        const index = precedent.findIndex((p) => p.id === platActifId);
        const cible = index === -1 ? precedent.length - 1 : index;
        const copie = [...precedent];
        const actif = copie[cible];
        const existante = actif.lignes.find(cle);
        let lignes: LignePanier[];
        if (existante) {
          lignes = actif.lignes.map((l) =>
            l === existante ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + quantite) } : l
          );
        } else {
          const quantiteAjoutee = plafonnerQuantite(produit, null, quantite);
          lignes = quantiteAjoutee > 0 ? [...actif.lignes, { ...nouvelleLigne(), quantite: quantiteAjoutee }] : actif.lignes;
        }
        copie[cible] = { ...actif, lignes };
        return copie;
      });
      setPlatDeplie(platActif.id);
      return;
    }

    setPanierSimple((precedent) => {
      const existante = precedent.find(cle);
      if (existante) {
        return precedent.map((l) =>
          l === existante ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + quantite) } : l
        );
      }
      const quantiteAjoutee = plafonnerQuantite(produit, null, quantite);
      return quantiteAjoutee > 0 ? [...precedent, { ...nouvelleLigne(), quantite: quantiteAjoutee }] : precedent;
    });
  }

  function surClicProduit(produit: ProduitCaisse) {
    const besoinConfigurateur =
      (!produit.viandeImposee && produit.nbViandesMax > 0) ||
      produit.nbSaucesIncluses > 0 ||
      produit.autoriseExtras ||
      produit.nbSaveursMax > 0 ||
      produit.accompagnementInclus;

    if (besoinConfigurateur) {
      setProduitEnSelection(produit);
      return;
    }
    // Sinon (Grillades, Accompagnements, boisson à choix unique, "Plat du
    // jour" à prix libre) : QuantiteModalPublique demande le prix du jour
    // si besoin et laisse choisir la quantité, jamais d'ajout direct.
    setProduitEnQuantite(produit);
  }

  /**
   * Grillades, accompagnements et boissons s'ouvrent tous dans la même
   * fenêtre "rayon" (VitrineModalPublique) — la caissière compose un
   * panier mixte en un seul geste, jamais besoin de rouvrir une fenêtre
   * par article. Tacos/Barquettes/Bowls/Plats du jour gardent leur
   * configurateur dédié, jamais concernés par le rayon.
   */
  function ouvrirRayon(sectionKey: string, produit: ProduitCaisse) {
    if (sectionKey === "grillade" || sectionKey === "accompagnement" || sectionKey === "boisson") {
      setVitrineOuverte(true);
      return;
    }
    surClicProduit(produit);
  }

  /** Ajoute en une fois tout ce qui a été composé dans la fenêtre "rayon". */
  function validerVitrine(choix: ChoixVitrine[]) {
    for (const c of choix) {
      ajouterAuPanier(c.produit as ProduitCaisse, [], [], c.saveur ? [c.saveur] : [], null, c.quantite);
    }
    setVitrineOuverte(false);
  }

  /**
   * Plafonne une quantité au stock du jour RÉELLEMENT restant, en tenant
   * compte de TOUTES les lignes déjà au panier pour ce produit — pas
   * seulement la ligne en cours. Indispensable pour un produit à choix
   * (ex: Poisson grillé + Frites, puis + Bananes) : sans ça, chaque variante
   * repart d'un plafond individuel à 10 et leur somme dépasse largement le
   * stock réel. `ligneId` exclut la ligne elle-même du décompte "déjà au
   * panier" quand on l'augmente (sinon elle se compterait deux fois).
   */
  function plafonnerQuantite(produit: { id: string; stockJour: number | null }, ligneId: string | null, quantiteVoulue: number): number {
    if (produit.stockJour === null) return quantiteVoulue;
    const dejaAuPanier = panierActuel
      .filter((l) => l.produit.id === produit.id && l.id !== ligneId)
      .reduce((total, l) => total + l.quantite, 0);
    return Math.max(0, Math.min(quantiteVoulue, produit.stockJour - dejaAuPanier));
  }

  function modifierQuantite(id: string, delta: number) {
    if (enModeGroupe) {
      setPlats((precedent) =>
        precedent.map((plat) => ({
          ...plat,
          lignes: plat.lignes
            .map((l) => (l.id === id ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + delta) } : l))
            .filter((l) => l.quantite > 0),
        }))
      );
      return;
    }
    setPanierSimple((precedent) =>
      precedent
        .map((l) => (l.id === id ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + delta) } : l))
        .filter((l) => l.quantite > 0)
    );
  }

  function retirerLigne(id: string) {
    if (enModeGroupe) {
      setPlats((precedent) => precedent.map((plat) => ({ ...plat, lignes: plat.lignes.filter((l) => l.id !== id) })));
      return;
    }
    setPanierSimple((precedent) => precedent.filter((l) => l.id !== id));
  }

  /**
   * Complète une formule passée en "Sans boisson" : remet `sansBoisson` à
   * false et fixe la saveur choisie, sans jamais créer de nouvelle ligne —
   * c'est la même canette que celle déjà comptée dans le prix de la
   * formule, jamais un article distinct facturé plein tarif.
   */
  function appliquerBoisson(id: string, saveur: string | null) {
    if (enModeGroupe) {
      setPlats((precedent) =>
        precedent.map((plat) => ({
          ...plat,
          lignes: plat.lignes.map((l) => (l.id === id ? { ...l, sansBoisson: false, boissonIncluse: saveur } : l)),
        }))
      );
    } else {
      setPanierSimple((precedent) =>
        precedent.map((l) => (l.id === id ? { ...l, sansBoisson: false, boissonIncluse: saveur } : l))
      );
    }
    setLigneCorrectionBoisson(null);
  }

  /** Ouvre le choix de saveur si plusieurs sont possibles, sinon applique directement l'unique saveur disponible. */
  function completerBoisson(ligne: LignePanier) {
    if (saveurs.length > 1) {
      setLigneCorrectionBoisson(ligne);
      return;
    }
    appliquerBoisson(ligne.id, saveurs[0]?.nom ?? null);
  }

  /** Symétrique de `appliquerBoisson` : repasse une ligne en "Sans boisson" sans recomposer toute la formule. */
  function retirerBoisson(id: string) {
    if (enModeGroupe) {
      setPlats((precedent) =>
        precedent.map((plat) => ({
          ...plat,
          lignes: plat.lignes.map((l) => (l.id === id ? { ...l, sansBoisson: true, boissonIncluse: null } : l)),
        }))
      );
      return;
    }
    setPanierSimple((precedent) =>
      precedent.map((l) => (l.id === id ? { ...l, sansBoisson: true, boissonIncluse: null } : l))
    );
  }

  /**
   * Avance au plat suivant : si un plat existe déjà après l'actif (ex.
   * après un retour en arrière via "Plat précédent"), on y navigue tel
   * quel ; sinon on en crée un nouveau. Dans les deux cas, le plat quitté
   * doit d'abord atteindre le seuil minimum.
   */
  function platSuivant() {
    if (totalPlat(platActif) < SEUIL_MINIMUM_PLAT) {
      setErreurPlat("Ce plat doit atteindre au moins 5€ pour être validé — ajoutez un accompagnement ou une boisson.");
      return;
    }
    setErreurPlat(null);
    const index = plats.findIndex((p) => p.id === platActifId);
    if (index !== -1 && index < plats.length - 1) {
      const suivant = plats[index + 1];
      setPlatActifId(suivant.id);
      setPlatDeplie(suivant.id);
      return;
    }
    setPlats((precedent) => {
      const nouveau = platVide(precedent.length + 1);
      setPlatActifId(nouveau.id);
      setPlatDeplie(nouveau.id);
      return [...precedent, nouveau];
    });
  }

  /** Revient au plat juste avant l'actif, pour le corriger sans attendre la vue panier finale — jamais bloqué par le seuil (on ne fait que naviguer, pas fermer). */
  function platPrecedent() {
    const index = plats.findIndex((p) => p.id === platActifId);
    if (index <= 0) return;
    setErreurPlat(null);
    const precedent = plats[index - 1];
    setPlatActifId(precedent.id);
    setPlatDeplie(precedent.id);
  }

  /** Rouvre un plat déjà "fermé" comme cible des prochains ajouts, tout en conservant son contenu existant. */
  function modifierPlat(platId: string) {
    setErreurPlat(null);
    setPlatActifId(platId);
    setPlatDeplie(platId);
  }

  function modifierPourQuiPlat(platId: string, valeur: string) {
    setPlats((precedent) => precedent.map((p) => (p.id === platId ? { ...p, pourQui: valeur } : p)));
  }

  function supprimerPlat(platId: string) {
    setPlats((precedent) => {
      if (precedent.length <= 1) return precedent;
      const suivant = precedent.filter((p) => p.id !== platId);
      if (platActifId === platId) setPlatActifId(suivant[suivant.length - 1].id);
      return suivant;
    });
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

  /** Vérifications communes à l'encaissement et à la modification — jamais de commande groupée sous le seuil, ni de plat sous 5€. */
  function validerPanierAvantEnvoi(): string | null {
    if (enModeGroupe && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE) {
      return "Ajoutez au moins 3 plats pour une commande groupée, ou repassez en commande simple.";
    }
    if (enModeGroupe) {
      const platsValides = plats.filter((p) => p.lignes.length > 0);
      const indexPlatSousLeSeuil = platsValides.findIndex((p) => totalPlat(p) < SEUIL_MINIMUM_PLAT);
      if (indexPlatSousLeSeuil !== -1) {
        return `Plat ${indexPlatSousLeSeuil + 1} : doit atteindre au moins 5€ pour être validé — ajoutez un accompagnement ou une boisson.`;
      }
    }
    return null;
  }

  /** Même transformation panier → payload pour la création (POST) et la modification (PATCH) — seule la requête HTTP diffère ensuite. */
  function construireLignesPayload() {
    return enModeGroupe
      ? plats.flatMap((plat, index) =>
          plat.lignes.map((l) => ({
            produitId: l.produit.id,
            quantite: l.quantite,
            viandes: l.viandes,
            sauces: l.sauces,
            saveurs: l.saveurs,
            boissonIncluse: l.boissonIncluse,
            sansBoisson: l.sansBoisson,
            prixSaisi: l.prixSaisi,
            saladeIncluse: l.saladeIncluse,
            accompagnementsInclus: l.accompagnementsInclus,
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
          sansBoisson: l.sansBoisson,
          prixSaisi: l.prixSaisi,
          saladeIncluse: l.saladeIncluse,
          accompagnementsInclus: l.accompagnementsInclus,
          platIndex: null,
          pourQui: null,
        }));
  }

  async function encaisser() {
    if (panierActuel.length === 0) return;
    const erreurValidation = validerPanierAvantEnvoi();
    if (erreurValidation) {
      setErreur(erreurValidation);
      return;
    }
    setEnvoiEnCours(true);
    setErreur(null);
    try {
      const lignesPayload = construireLignesPayload();

      const reponse = await fetch("/api/caisse/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          modePaiement,
          clientTelephone: telephone.trim(),
          recompenseAppliquee: appliquerRecompenseEffectif,
          boissonOfferteSaveur: palierGroupeReel === "GROUPE_4" ? (boissonOfferteSaveur ?? undefined) : undefined,
          creneauHeure,
          nom: nom.trim(),
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          lignes: lignesPayload,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'encaissement.");
        return;
      }
      setConfirmation({ commandeId: data.commandeId, montant: data.montant, canal });

      // Impression immédiate, sans bloquer l'écran de confirmation : une
      // imprimante non configurée ou hors ligne n'empêche jamais
      // l'encaissement (déjà enregistré à ce stade), juste un avertissement
      // discret (cf. imprimerEtSignaler).
      const lignesPourImpression: LigneCommande[] = (
        enModeGroupe
          ? plats.flatMap((plat) => plat.lignes.map((l) => ({ ligne: l, pourQui: plat.pourQui.trim() || null })))
          : panierSimple.map((l) => ({ ligne: l, pourQui: null }))
      ).map(({ ligne: l, pourQui }) => ({
        produitId: l.produit.id,
        nom: l.produit.nom,
        categorie: l.produit.categorie,
        quantite: l.quantite,
        prixUnitaire: prixLigne(l),
        coutMatiereUnitaire: l.produit.coutMatiere,
        viandes: l.viandes,
        sauces: l.sauces,
        saveurs: l.saveurs,
        boissonIncluse: l.boissonIncluse,
        sansBoisson: l.sansBoisson,
        canetteIncluse: l.produit.canetteIncluse,
        saladeIncluse: l.saladeIncluse,
        accompagnementsInclus: l.accompagnementsInclus,
        pourQui,
        platIndex: null,
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
        nbPlats: enModeGroupe ? nbPlatsValides : 0,
      });

      setPanierSimple([]);
      setPlats([platVide(1)]);
      setPlatDeplie(null);
      setModeCommande(null);
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

  /**
   * Enregistre les modifications d'une commande existante (PATCH) — jamais
   * de canal ni de récompense fidélité dans le payload (verrouillés côté
   * serveur, cf. lib/caisse/modification.ts), et pas d'impression ni d'écran
   * de confirmation avec ticket : on revient simplement sur /commandes une
   * fois enregistré.
   */
  async function enregistrerModification() {
    if (!commandeExistante || panierActuel.length === 0) return;
    const erreurValidation = validerPanierAvantEnvoi();
    if (erreurValidation) {
      setErreur(erreurValidation);
      return;
    }
    setEnvoiEnCours(true);
    setErreur(null);
    try {
      const lignesPayload = construireLignesPayload();

      const reponse = await fetch("/api/caisse/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandeId: commandeExistante.id,
          modePaiement,
          clientTelephone: telephone.trim(),
          boissonOfferteSaveur: palierGroupeReel === "GROUPE_4" ? (boissonOfferteSaveur ?? undefined) : undefined,
          creneauHeure,
          nom: nom.trim(),
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          lignes: lignesPayload,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la modification.");
        return;
      }
      router.push("/commandes");
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (confirmation) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-bold text-gray-900">
          {confirmation.canal === "livraison" ? "Commande enregistrée ✅" : "Commande encaissée ✅"}
        </p>
        <p className="text-gray-600">
          {confirmation.canal === "livraison"
            ? `À encaisser au retour du livreur : ${confirmation.montant.toFixed(2)} €`
            : `Montant : ${confirmation.montant.toFixed(2)} €`}
        </p>
        <button
          onClick={() => setConfirmation(null)}
          className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white"
        >
          Nouvelle commande
        </button>
      </div>
    );
  }

  /** Rendu d'une ligne de panier — identique en mode comptoir/simple et à l'intérieur d'un plat déplié en mode groupé. */
  function ligneJsx(l: LignePanier) {
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
        {l.boissonIncluse && (
          <div className="text-xs text-gray-400">
            <div>Boisson incluse : {l.boissonIncluse}</div>
            {l.produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && (
              <button
                type="button"
                onClick={() => retirerBoisson(l.id)}
                className="mt-0.5 text-orange-600 underline decoration-dotted"
              >
                − Retirer la boisson (-{MONTANT_REDUCTION_SANS_BOISSON.toFixed(2)} €)
              </button>
            )}
          </div>
        )}
        {l.sansBoisson && (
          <div className="text-xs font-semibold text-orange-600">
            <div>Sans boisson (-{MONTANT_REDUCTION_SANS_BOISSON.toFixed(2)} €)</div>
            <button
              type="button"
              onClick={() => completerBoisson(l)}
              className="mt-0.5 underline decoration-dotted"
            >
              + Ajouter la boisson (+{MONTANT_REDUCTION_SANS_BOISSON.toFixed(2)} €)
            </button>
          </div>
        )}
        {l.accompagnementsInclus.length > 0 && (
          <div className="text-xs text-gray-400">Accompagnement : {l.accompagnementsInclus.join(" + ")}</div>
        )}
        {l.saladeIncluse !== null && (
          <div className="text-xs text-gray-400">{l.saladeIncluse ? "Avec salade" : "Sans salade"}</div>
        )}
        {piecesParPaquet(l.produit.nom) > 1 && (
          <div className="text-xs text-gray-400">
            = {l.quantite * piecesParPaquet(l.produit.nom)}{" "}
            {nomPluriel(nomSansMultiplicateur(l.produit.nom).toLowerCase(), l.quantite * piecesParPaquet(l.produit.nom))}{" "}
            au total
          </div>
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
          <span className="ml-auto font-medium text-gray-900">{(prixLigne(l) * l.quantite).toFixed(2)} €</span>
        </div>
      </li>
    );
  }

  return (
    <div className={`space-y-4 ${modeCommande !== null ? "pb-20" : ""}`}>
      {modeCommande === null ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-center font-semibold text-gray-900">Le client commande pour lui, ou pour un groupe ?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setModeCommande("simple")}
              className="bouton-choix-mode rounded py-3 text-sm font-bold uppercase text-white"
              style={{ backgroundColor: VERT }}
            >
              Commande simple
            </button>
            <button
              onClick={() => setModeCommande("groupee")}
              className="bouton-choix-mode rounded bg-[#8B2020] py-3 text-sm font-bold uppercase text-white"
              style={{ animationDelay: "0.3s" }}
            >
              Commande groupée
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {enModeEdition ? (
            <div className="flex items-center justify-between rounded-lg border border-[#8B2020] bg-[#8B2020]/5 px-3 py-2">
              <p className="text-sm font-semibold text-[#8B2020]">
                ✏️ Modification de la commande n°{commandeExistante.numero}
              </p>
              <button
                type="button"
                onClick={() => router.push("/commandes")}
                className="text-sm font-semibold text-gray-500 underline"
              >
                Annuler la modification
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={retourChoixMode}
              className="text-sm font-semibold text-gray-500 underline"
            >
              ← Changer de mode ({enModeGroupe ? "commande groupée" : "commande simple"})
            </button>
          )}

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
                        onClick={() => ouvrirRayon(section.key, produit)}
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
                        onClick={() => produit.stockJour !== 0 && ouvrirRayon(section.key, produit)}
                        disabled={produit.stockJour === 0}
                        className={`rounded-lg border p-3 text-left text-sm shadow-sm ${
                          produit.stockJour === 0
                            ? "border-gray-200 bg-gray-100 opacity-60"
                            : "border-gray-200 bg-white active:bg-gray-50"
                        }`}
                      >
                        <div className="font-medium text-gray-900">{produit.nom}</div>
                        {produit.description && (
                          <div className="mt-0.5 text-xs text-gray-500">{produit.description}</div>
                        )}
                        <div className="mt-1 font-semibold text-gray-900">
                          {produit.prix !== null ? `${produit.prix.toFixed(2)} €` : "Prix du jour"}
                        </div>
                        {produit.stockJour === 0 && (
                          <div className="mt-1 text-xs font-bold text-red-600">Épuisé aujourd&apos;hui</div>
                        )}
                        {produit.stockJour !== null && produit.stockJour > 0 && produit.stockJour <= 3 && (
                          <div className="mt-1 text-xs font-semibold text-orange-600">
                            Plus que {produit.stockJour} !
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div id="panier-caisse" className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Caissier·e : {nomEmploye}</p>
            <p className="text-xs text-gray-400">
              🖨️{" "}
              {imprimantes
                .map(
                  (i) => `${i.role === "comptoir" ? "Comptoir" : "Cuisine"} ${i.adresseIp ? "configurée" : "non configurée"}`
                )
                .join(" · ")}
            </p>
            {avertissementImpression && <p className="text-xs text-orange-600">⚠️ {avertissementImpression}</p>}

            {enModeGroupe && (
              <div className="rounded-lg border border-[#8B2020] p-3">
                <p className="text-sm font-semibold text-gray-900">
                  Plat actif :{" "}
                  <span className="text-[#8B2020]">
                    Plat {plats.findIndex((p) => p.id === platActifId) + 1}
                  </span>
                  {platActif.pourQui ? ` (${platActif.pourQui})` : ""}
                </p>
                {erreurPlat && <p className="mt-2 text-sm text-red-600">{erreurPlat}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={platPrecedent}
                    disabled={plats.findIndex((p) => p.id === platActifId) <= 0}
                    className="flex-1 rounded border border-gray-300 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
                  >
                    ← Plat précédent
                  </button>
                  <button
                    type="button"
                    onClick={platSuivant}
                    disabled={platActif.lignes.length === 0}
                    className="flex-1 rounded bg-[#2D5A27] py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Plat suivant →
                  </button>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-gray-900">Panier</h3>

              <div className="mt-2 rounded-lg p-2 text-white" style={{ backgroundColor: "#2D5A27" }}>
                <p className="text-sm font-bold">🚀 Commande groupée, avant 11h</p>
                <p className="text-xs text-white/90">
                  3 plats et {SEUIL_GROUPE_3_MONTANT}€ → livraison prioritaire.
                  <br />4 plats et {SEUIL_GROUPE_4_MONTANT}€ → livraison prioritaire + boisson 2L offerte.
                </p>
              </div>

              {!enModeGroupe ? (
                <>
                  {panierSimple.length === 0 && <p className="mt-2 text-sm text-gray-400">Vide.</p>}
                  <ul className="mt-2 space-y-2">{panierSimple.map(ligneJsx)}</ul>
                </>
              ) : (
                <>
                  {panierActuel.length === 0 && <p className="mt-2 text-sm text-gray-400">Vide.</p>}
                  <ul className="mt-2 space-y-2">
                    {plats.map((plat, index) => {
                      if (plat.lignes.length === 0) return null;
                      const totalPlat = plat.lignes.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
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
                              <div className="flex items-center gap-3">
                                {platActifId !== plat.id && (
                                  <button
                                    type="button"
                                    onClick={() => modifierPlat(plat.id)}
                                    className="text-xs font-semibold text-[#8B2020] underline"
                                  >
                                    Modifier
                                  </button>
                                )}
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
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {nbPlatsValides > 0 && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE && (
                    <p className="texte-alerte-pulsant mt-2 text-sm font-bold text-[#8B2020]">
                      {SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides === 1
                        ? "Plus qu'un plat pour valider la commande groupée."
                        : `Plus que ${SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides} plats pour valider la commande groupée.`}
                    </p>
                  )}
                  {nbPlatsValides >= SEUIL_COMMANDE_PRIORITAIRE &&
                    (() => {
                      if (groupeTropTard) {
                        return (
                          <p className="mt-2 text-sm font-semibold text-orange-600">
                            Trop tard pour aujourd&apos;hui — la commande groupée doit être passée avant 11h.
                          </p>
                        );
                      }
                      // La boisson offerte (GROUPE_4) s'applique quel que soit le canal ;
                      // la priorité reste propre à la livraison.
                      if (canal !== "livraison") {
                        if (palierGroupeReel === "GROUPE_4") {
                          return (
                            <p className="mt-2 text-sm font-bold text-[#2D5A27]">🎁 Boisson 2L offerte activée !</p>
                          );
                        }
                        return (
                          <p className="mt-2 text-sm font-semibold text-[#2D5A27]">
                            {messageProgressionBoissonOfferte(nbPlatsValides, total)}
                          </p>
                        );
                      }
                      if (palierGroupeReel === "GROUPE_4") {
                        return (
                          <p className="mt-2 text-sm font-bold text-[#2D5A27]">
                            🚀 Priorité + 🎁 boisson 2L offerte activées !
                          </p>
                        );
                      }
                      if (palierGroupeReel === "GROUPE_3") {
                        return (
                          <p className="mt-2 text-sm font-semibold text-[#2D5A27]">
                            🚀 Priorité activée ! {messageProgressionBoissonOfferte(nbPlatsValides, total)}
                          </p>
                        );
                      }
                      const montantRestant = Math.max(0, SEUIL_GROUPE_3_MONTANT - total);
                      if (montantRestant > 0) {
                        return (
                          <p className="mt-2 text-sm font-semibold text-[#2D5A27]">
                            Encore {montantRestant.toFixed(2)}€ pour la livraison prioritaire 🚀
                          </p>
                        );
                      }
                      return null;
                    })()}
                  {palierGroupeReel === "GROUPE_4" && (
                    <div className="mt-2 rounded-lg border border-gray-300 bg-gray-50 p-2">
                      <p className="text-xs font-semibold text-gray-900">🎁 Parfum de la boisson 2L offerte</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {parfums2l.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setBoissonOfferteSaveur(s.nom)}
                            className={`rounded-full border px-2.5 py-1 text-xs ${
                              boissonOfferteSaveur === s.nom
                                ? "border-[#8B2020] bg-[#8B2020] text-white"
                                : "border-gray-300 text-gray-700"
                            }`}
                          >
                            {s.nom}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
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
              <p className="mt-1 text-xs text-gray-400">Numéro d&apos;un autre pays : commence par +, ex. +33...</p>
              {clientInfo && (
                <div className="mt-2 text-sm text-gray-700">
                  {clientInfo.existe ? (
                    <>
                      <div className="flex gap-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-3 w-3 rounded-full ${
                              i < (clientInfo.tampons_acquis ?? 0) ? "bg-[#8B2020]" : "bg-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="mt-1 font-semibold">
                        {messageFidelite({
                          montantCumule: clientInfo.montant_cumule ?? 0,
                          recompenseDisponible: clientInfo.recompense_disponible ?? false,
                        })}
                      </p>
                      {clientInfo.recompense_disponible && (
                        <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm font-bold text-red-700">
                          <p>Ce client a 10€ de récompense — appliquer ?</p>
                          {clientInfo.date_expiration && (
                            <p className="text-xs font-normal text-red-600">
                              Expire le {new Date(clientInfo.date_expiration).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                          <label className="mt-1 flex items-center gap-2 font-normal">
                            <input
                              type="checkbox"
                              checked={appliquerRecompense}
                              disabled={total < MONTANT_RECOMPENSE}
                              onChange={(e) => setAppliquerRecompense(e.target.checked)}
                            />
                            Appliquer la récompense (-10 €)
                          </label>
                          {total < MONTANT_RECOMPENSE && (
                            <p className="text-xs font-normal text-red-600">Commande d&apos;au moins 10€ requise.</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">Nouveau client (sera créé au paiement).</p>
                  )}
                </div>
              )}
              {!clientInfo && (
                <p className="mt-2 text-xs text-gray-500">
                  🎁 {MONTANT_RECOMPENSE}€ dépensés = 1 tampon. {SEUIL_RECOMPENSE / MONTANT_RECOMPENSE} tampons ={" "}
                  {MONTANT_RECOMPENSE}€ offerts.
                </p>
              )}
            </div>

            <div className="border-t border-gray-200 pt-3">
              <label className="text-xs text-gray-500">Comment récupérer la commande ?</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <button
                  onClick={() => setCanal("sur_place")}
                  disabled={enModeEdition}
                  className={`rounded border py-2 text-xs font-bold uppercase disabled:opacity-40 ${
                    canal === "sur_place" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                  }`}
                >
                  Sur place
                </button>
                <button
                  onClick={() => setCanal("emporter")}
                  disabled={enModeEdition}
                  className={`rounded border py-2 text-xs font-bold uppercase disabled:opacity-40 ${
                    canal === "emporter" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                  }`}
                >
                  À emporter
                </button>
                <button
                  onClick={() => setCanal("livraison")}
                  disabled={enModeEdition || !livraisonPossible}
                  className={`rounded border py-2 text-xs font-bold uppercase disabled:opacity-40 ${
                    canal === "livraison" ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                  }`}
                >
                  Livraison
                </button>
              </div>
              {enModeEdition && (
                <p className="mt-2 text-xs text-gray-400">
                  Canal non modifiable ici — pour en changer, annule la commande et recrée-la.
                </p>
              )}
              {canal === "livraison" && !minimumAtteint && (
                <p className="mt-2 text-xs text-orange-600">
                  Minimum {parametres.minimumCommande.toFixed(2)} € pour la livraison — ajoute des articles ou choisis
                  un autre canal.
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
              {(appliquerRecompenseEffectif && clientInfo?.recompense_disponible ? total - MONTANT_RECOMPENSE : total).toFixed(
                2
              )}{" "}
              €
              {total > 0 && (
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {texteProgressionFidelite(
                    progressionFideliteCommande(total, clientInfo?.existe ? (clientInfo.montant_cumule ?? 0) : 0)
                  )}
                </p>
              )}
            </div>

            {erreur && <p className="text-sm text-red-600">{erreur}</p>}

            <button
              onClick={enModeEdition ? enregistrerModification : encaisser}
              disabled={
                panierActuel.length === 0 ||
                envoiEnCours ||
                canalLivraisonBloque ||
                infosClientIncompletes ||
                (enModeGroupe && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE) ||
                (palierGroupeReel === "GROUPE_4" && !boissonOfferteSaveur)
              }
              className="w-full rounded bg-[#8B2020] py-3 font-semibold text-white disabled:opacity-40"
            >
              {envoiEnCours
                ? "Envoi…"
                : enModeEdition
                  ? "Enregistrer les modifications"
                  : canal === "livraison"
                    ? "Valider la commande"
                    : "Encaisser"}
            </button>
          </div>
          </div>
        </div>
      )}

      {modeCommande !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            {panierActuel.length === 0 ? (
              <span className="text-sm text-gray-400">Panier vide</span>
            ) : (
              <>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {enModeGroupe
                      ? `${nbPlatsValides} plat${nbPlatsValides > 1 ? "s" : ""}`
                      : `${panierActuel.reduce((acc, l) => acc + l.quantite, 0)} article${
                          panierActuel.reduce((acc, l) => acc + l.quantite, 0) > 1 ? "s" : ""
                        }`}
                  </div>
                  <div className="text-xs text-gray-500">{total.toFixed(2)} €</div>
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById("panier-caisse")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: ROUGE }}
                >
                  Voir le panier
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {produitEnSelection && produitEnSelection.nbSaveursMax > 0 && (
        <SaveurModalPublique
          produit={produitEnSelection}
          saveurs={produitEnSelection.nom === NOM_PRODUIT_BOISSON_OFFERTE ? parfums2l : saveurs}
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
          accompagnements={accompagnements}
          produitViandeSupplementaire={produitViandeSupplementaire}
          produitSauceSupplementaire={produitSauceSupplementaire}
          canetteRapideProduit={produitEnSelection.categorie === "plat_du_jour" ? produitCanetteRapide : null}
          canetteRapideSaveurs={saveurs}
          quantiteMax={
            produitEnSelection.stockJour !== null
              ? plafonnerQuantite(produitEnSelection, null, produitEnSelection.stockJour)
              : undefined
          }
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(
            viandesChoisies,
            saucesChoisies,
            extras,
            boissonIncluse,
            saladeIncluse,
            saladeOption,
            accompagnementsInclus,
            sansBoisson,
            quantite,
            canettesRapidesChoisies
          ) => {
            ajouterAuPanier(
              produitEnSelection,
              viandesChoisies,
              saucesChoisies,
              [],
              boissonIncluse,
              quantite,
              undefined,
              saladeIncluse,
              accompagnementsInclus,
              sansBoisson
            );
            if (produitViandeSupplementaire) {
              for (const nomViande of extras.viandesSupplementaires) {
                ajouterAuPanier(produitViandeSupplementaire, [nomViande], [], [], null, 1, undefined, null);
              }
            }
            if (produitSauceSupplementaire) {
              for (const nomSauce of extras.saucesSupplementaires) {
                ajouterAuPanier(produitSauceSupplementaire, [], [nomSauce], [], null, 1, undefined, null);
              }
            }
            if (saladeOption && produitSaladeSupplementaire) {
              ajouterAuPanier(produitSaladeSupplementaire, [], [], [], null, 1, undefined, null);
            }
            if (produitCanetteRapide) {
              for (const saveur of canettesRapidesChoisies) {
                ajouterAuPanier(produitCanetteRapide, [], [], [saveur], null, 1);
              }
            }
            setProduitEnSelection(null);
          }}
        />
      )}

      {produitEnQuantite && (
        <QuantiteModalPublique
          produit={{
            ...produitEnQuantite,
            // Stock affiché/plafonné dans le sélecteur = ce qu'il reste
            // VRAIMENT compte tenu de ce que ce produit occupe déjà dans le
            // panier (toutes variantes confondues) — jamais le stock brut.
            stockJour:
              produitEnQuantite.stockJour !== null
                ? plafonnerQuantite(produitEnQuantite, null, produitEnQuantite.stockJour)
                : null,
          }}
          canetteProduit={produitEnQuantite.categorie === "plat_du_jour" ? produitCanetteRapide : null}
          canetteSaveurs={saveurs}
          onAnnuler={() => setProduitEnQuantite(null)}
          onValider={(quantite, prixSaisi, canettesChoisies) => {
            ajouterAuPanier(
              produitEnQuantite,
              produitEnQuantite.viandeImposee ? [produitEnQuantite.viandeImposee] : [],
              [],
              [],
              null,
              quantite,
              prixSaisi
            );
            if (produitCanetteRapide) {
              for (const saveur of canettesChoisies ?? []) {
                ajouterAuPanier(produitCanetteRapide, [], [], [saveur], null, 1);
              }
            }
            setProduitEnQuantite(null);
          }}
        />
      )}

      {vitrineOuverte &&
        (() => {
          const sectionGrillade = sections.find((s) => s.key === "grillade");
          const sectionAccompagnement = sections.find((s) => s.key === "accompagnement");
          const sectionBoisson = sections.find((s) => s.key === "boisson");
          const boissonsSimples = (sectionBoisson?.produits ?? []).filter((p) => p.nbSaveursMax === 0);
          const boissonsAvecSaveurs = (sectionBoisson?.produits ?? [])
            .filter((p) => p.nbSaveursMax > 0)
            .map((p) => ({ produit: p, saveurs: p.nom === NOM_PRODUIT_BOISSON_OFFERTE ? parfums2l : saveurs }));
          return (
            <VitrineModalPublique
              titre="Grillades, accompagnements & boissons"
              sections={[
                { titre: "Grillades", produits: sectionGrillade?.produits ?? [] },
                { titre: "Accompagnements", produits: sectionAccompagnement?.produits ?? [] },
                { titre: "Boissons", produits: boissonsSimples },
              ]}
              produitsAvecSaveurs={boissonsAvecSaveurs}
              onAnnuler={() => setVitrineOuverte(false)}
              onValider={validerVitrine}
            />
          );
        })()}

      {ligneCorrectionBoisson && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-5 sm:rounded-2xl">
            <h2 className="text-lg font-bold text-gray-900">Choisis ta canette</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {saveurs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => appliquerBoisson(ligneCorrectionBoisson.id, s.nom)}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {s.nom}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLigneCorrectionBoisson(null)}
              className="mt-4 text-sm text-gray-500 underline"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
