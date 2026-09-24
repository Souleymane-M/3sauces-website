"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  NOM_PRODUIT_MENU_ETUDIANT,
  MONTANT_REDUCTION_SANS_BOISSON,
} from "@/lib/commande-publique/types";
import { creneauxPourDate, prochainesDatesOuvertes, dateMayotteIso } from "@/lib/commande-publique/creneau";
import { SEUIL_COMMANDE_PRIORITAIRE, SEUIL_MINIMUM_PLAT } from "@/lib/plats";
import {
  SEUIL_GROUPE_3_PLATS,
  SEUIL_GROUPE_3_MONTANT,
  SEUIL_GROUPE_4_PLATS,
  SEUIL_GROUPE_4_MONTANT,
  NOM_PRODUIT_BOISSON_OFFERTE,
  palierGroupeActif,
} from "@/lib/commande-publique/groupe-priorite";
import { FooterLegal } from "@/components/legal/footer-legal";
import { ViandeModalPublique } from "./viande-modal-publique";
import { SaveurModalPublique } from "./saveur-modal-publique";
import { QuantiteModalPublique } from "./quantite-modal-publique";
import { CreneauPicker } from "./creneau-picker";
import { DatePicker } from "./date-picker";
import { CarteFidelite } from "./carte-fidelite";
import { MONTANT_RECOMPENSE } from "@/lib/fidelite/regles";
import { MONTANT_REMISE_LANCEMENT, SEUIL_REMISE_LANCEMENT } from "@/lib/commande-publique/remise-lancement";

interface LignePanierPublique {
  id: string;
  produit: ProduitPublic;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
  sansBoisson: boolean;
  saladeIncluse: boolean | null;
  accompagnementsInclus: string[];
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
  /** Parfums de la Boisson 2L — référentiel indépendant de `saveurs` (canettes), cf. lib/patron/options.ts. */
  parfums2l: SaveurPublique[];
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

/**
 * sessionStorage (pas localStorage) : le panier en cours doit survivre à un
 * rechargement accidentel de l'onglet, mais jamais réapparaître dans une
 * nouvelle visite le lendemain ou dans un autre onglet.
 */
const CLE_PANIER_PUBLIC = "3sauces_commande_panier";

function platVide(numero: number): PlatGroupe {
  return { id: `plat-${numero}-${Date.now()}-${Math.random()}`, pourQui: "", lignes: [] };
}

export function CommandePubliqueApp({
  produits,
  viandes,
  sauces,
  saveurs,
  parfums2l,
  parametres,
}: CommandePubliqueAppProps) {
  const router = useRouter();

  const aujourdHui = useMemo(() => dateMayotteIso(), []);
  const datesOuvertes = useMemo(
    () => prochainesDatesOuvertes(parametres.joursFermeture, parametres.heureDebut, parametres.heureFin),
    [parametres.joursFermeture, parametres.heureDebut, parametres.heureFin]
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
  // Cible des prochains ajouts en mode groupé — pas forcément le dernier
  // plat du tableau : "Modifier" sur une carte déjà fermée permet de
  // rediriger les ajouts vers elle sans rien recommencer.
  const [platActifId, setPlatActifId] = useState<string>(plats[0].id);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  const [produitEnQuantite, setProduitEnQuantite] = useState<ProduitPublic | null>(null);
  // Ligne du panier pour laquelle le client vient de cliquer "+ Ajouter la
  // boisson" sur une formule passée en "Sans boisson" : ouvre un choix de
  // saveur si plusieurs sont possibles, sinon appliqué directement.
  const [ligneCorrectionBoisson, setLigneCorrectionBoisson] = useState<LignePanierPublique | null>(null);
  const [canal, setCanal] = useState<CanalPublic>("sur_place");
  const [boissonOfferteSaveur, setBoissonOfferteSaveur] = useState<string | null>(null);

  // Restauration du panier après un rechargement accidentel de l'onglet : on
  // ne persiste qu'après cette première lecture (`pretPourPersistance`),
  // sinon le tout premier effet d'écriture, qui s'exécute avant que les
  // `setState` de restauration ci-dessous n'aient été pris en compte,
  // écraserait le panier sauvegardé avec un panier vide.
  const [pretPourPersistance, setPretPourPersistance] = useState(false);
  useEffect(() => {
    // Différé en microtâche : lire sessionStorage et restaurer l'état sont
    // deux opérations distinctes, jamais un simple calcul synchrone de
    // rendu — le report en microtâche évite les rendus en cascade au
    // montage tout en gardant la restauration quasi instantanée.
    queueMicrotask(() => {
      try {
        const brut = sessionStorage.getItem(CLE_PANIER_PUBLIC);
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
  }, []);

  useEffect(() => {
    if (!pretPourPersistance) return;
    try {
      sessionStorage.setItem(
        CLE_PANIER_PUBLIC,
        JSON.stringify({ modeCommande, panierSimple, plats, platDeplie, platActifId, canal, boissonOfferteSaveur })
      );
    } catch {
      // Stockage plein ou indisponible : la session continue simplement sans persistance.
    }
  }, [pretPourPersistance, modeCommande, panierSimple, plats, platDeplie, platActifId, canal, boissonOfferteSaveur]);

  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [zone, setZone] = useState(parametres.zonesActives[0] ?? "");
  const [dateCommande, setDateCommande] = useState(() => datesOuvertes[0] ?? aujourdHui);
  const creneauxValides = useMemo(
    () => creneauxPourDate(dateCommande, parametres.heureDebut, parametres.heureFin),
    [dateCommande, parametres.heureDebut, parametres.heureFin]
  );
  const [creneauHeure, setCreneauHeure] = useState(() => creneauxValides[0] ?? "");
  const commandeAvance = dateCommande !== aujourdHui;
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [fideliteToken, setFideliteToken] = useState<string | null>(null);
  const [utiliserRecompense, setUtiliserRecompense] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [accepteCgv, setAccepteCgv] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Erreur spécifique à la navigation entre plats (seuil de 5€ non atteint) —
  // séparée de `erreur` (formulaire, tout en bas) pour s'afficher juste
  // au-dessus du bouton "Plat suivant", là où le client regarde au moment
  // du clic.
  const [erreurPlat, setErreurPlat] = useState<string | null>(null);
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
  // Accompagnements proposés en choix gratuit inclus (Plats du jour) —
  // jamais "Salade", qui est incluse automatiquement sans choix quand elle
  // fait partie de la recette (pas le même mécanisme que ce choix libre).
  const accompagnements = useMemo(
    () => produits.filter((p) => p.categorie === "accompagnement" && p.nom !== "Salade"),
    [produits]
  );

  const platActif = plats.find((p) => p.id === platActifId) ?? plats[plats.length - 1];
  // Prix effectif d'une ligne : le prix catalogue, moins la réduction "sans
  // boisson" si le client a refusé la canette incluse de cette ligne.
  const prixLigne = (l: LignePanierPublique) =>
    l.produit.prix - (l.sansBoisson ? MONTANT_REDUCTION_SANS_BOISSON : 0);
  const totalPlat = (plat: PlatGroupe) => plat.lignes.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  // Un plat fraîchement ouvert et encore vide ne compte pas — seulement
  // ceux dans lesquels le client a effectivement mis quelque chose.
  const nbPlatsValides = plats.filter((p) => p.lignes.length > 0).length;

  const panierActuel = modeCommande === "groupee" ? plats.flatMap((p) => p.lignes) : panierSimple;
  const total = panierActuel.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const nbArticles = panierActuel.reduce((acc, l) => acc + l.quantite, 0);
  // Palier réel (canal effectivement choisi) pour le blocage/la soumission —
  // distinct du message d'encouragement affiché dans le panier avant que le
  // canal soit choisi (qui suppose "livraison" pour rester incitatif).
  const palierGroupeReel = palierGroupeActif(nbPlatsValides, total, canal);

  /** Revient à l'écran de choix "Commande simple / Commande groupée" — vide le panier en cours (avec confirmation s'il n'est pas vide) puisque les deux modes ne partagent pas la même structure de panier. */
  function retourChoixMode() {
    if (nbArticles > 0 && !window.confirm("Changer de mode videra le panier en cours. Continuer ?")) {
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
   * Changer de date change la liste des créneaux disponibles : on garde
   * l'heure déjà choisie si elle reste proposable, sinon on retombe sur le
   * premier créneau du jour. Une commande à l'avance (date != aujourd'hui)
   * bascule d'office en paiement en ligne — personne ne peut garantir un
   * encaissement en personne à une date future.
   */
  function changerDate(nouvelleDate: string) {
    setDateCommande(nouvelleDate);
    const creneaux = creneauxPourDate(nouvelleDate, parametres.heureDebut, parametres.heureFin);
    setCreneauHeure(creneaux.includes(creneauHeure) ? creneauHeure : (creneaux[0] ?? ""));
    if (nouvelleDate !== aujourdHui) setModePaiement("stripe");
  }

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
    saladeIncluse: boolean | null = null,
    accompagnementsInclus: string[] = [],
    sansBoisson: boolean = false
  ) {
    declencherPulse();
    const cle = (l: LignePanierPublique) =>
      l.produit.id === produit.id &&
      JSON.stringify([...l.viandes].sort()) === JSON.stringify([...viandesChoisies].sort()) &&
      JSON.stringify([...l.sauces].sort()) === JSON.stringify([...saucesChoisies].sort()) &&
      JSON.stringify([...l.saveurs].sort()) === JSON.stringify([...saveursChoisies].sort()) &&
      l.boissonIncluse === boissonIncluse &&
      l.sansBoisson === sansBoisson &&
      l.saladeIncluse === saladeIncluse &&
      JSON.stringify([...l.accompagnementsInclus].sort()) === JSON.stringify([...accompagnementsInclus].sort());
    const nouvelleLigne = (): LignePanierPublique => ({
      id: `${produit.id}-${Date.now()}-${Math.random()}`,
      produit,
      quantite,
      viandes: viandesChoisies,
      sauces: saucesChoisies,
      saveurs: saveursChoisies,
      boissonIncluse,
      sansBoisson,
      saladeIncluse,
      accompagnementsInclus,
    });

    if (modeCommande === "groupee") {
      setErreurPlat(null);
      setPlats((precedent) => {
        const index = precedent.findIndex((p) => p.id === platActifId);
        const cible = index === -1 ? precedent.length - 1 : index;
        const copie = [...precedent];
        const actif = copie[cible];
        const existante = actif.lignes.find(cle);
        const lignes = existante
          ? actif.lignes.map((l) => (l === existante ? { ...l, quantite: l.quantite + quantite } : l))
          : [...actif.lignes, nouvelleLigne()];
        copie[cible] = { ...actif, lignes };
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
      produit.nbSaveursMax > 0 ||
      produit.accompagnementInclus;

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

  /**
   * Complète une formule passée en "Sans boisson" : remet `sansBoisson` à
   * false et fixe la saveur choisie, sans jamais créer de nouvelle ligne —
   * c'est la même canette que celle déjà comptée dans le prix de la
   * formule, jamais un article distinct facturé plein tarif.
   */
  function appliquerBoisson(id: string, saveur: string | null) {
    if (modeCommande === "groupee") {
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
  function completerBoisson(ligne: LignePanierPublique) {
    if (saveurs.length > 1) {
      setLigneCorrectionBoisson(ligne);
      return;
    }
    appliquerBoisson(ligne.id, saveurs[0]?.nom ?? null);
  }

  /** Symétrique de `appliquerBoisson` : repasse une ligne en "Sans boisson" sans recomposer toute la formule. */
  function retirerBoisson(id: string) {
    if (modeCommande === "groupee") {
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
    if (modeCommande === "groupee") {
      const platsValides = plats.filter((p) => p.lignes.length > 0);
      const indexPlatSousLeSeuil = platsValides.findIndex((p) => totalPlat(p) < SEUIL_MINIMUM_PLAT);
      if (indexPlatSousLeSeuil !== -1) {
        setErreur(
          `Plat ${indexPlatSousLeSeuil + 1} : doit atteindre au moins 5€ pour être validé — ajoutez un accompagnement ou une boisson.`
        );
        return;
      }
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
                sansBoisson: l.sansBoisson,
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
              saladeIncluse: l.saladeIncluse,
              accompagnementsInclus: l.accompagnementsInclus,
              platIndex: null,
              pourQui: null,
            }));

      // Jamais confiance dans le seul state pour le mode de paiement d'une
      // commande à l'avance : même si l'UI le verrouille déjà sur "stripe"
      // dès que la date choisie n'est pas aujourd'hui, on le recalcule ici.
      const modePaiementEffectif: ModePaiement = commandeAvance ? "stripe" : modePaiement;

      const reponse = await fetch("/api/commande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          nom: nom.trim(),
          telephone: telephone.trim(),
          modePaiement: modePaiementEffectif,
          creneauHeure,
          date: dateCommande,
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          consentementCgv: accepteCgv,
          lignes,
          fideliteToken: utiliserRecompense ? fideliteToken : undefined,
          utiliserRecompense: utiliserRecompense && Boolean(fideliteToken),
          boissonOfferteSaveur: palierGroupeReel === "GROUPE_4" ? (boissonOfferteSaveur ?? undefined) : undefined,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'envoi de la commande.");
        return;
      }

      if (modePaiementEffectif === "stripe") {
        // La commande existe déjà (non_paye) : si cet appel échoue, elle
        // reste réessayable sans jamais créer de doublon.
        const reponsePaiement = await fetch("/api/commande/paiement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commandeId: data.commandeId }),
        });
        const dataPaiement = await reponsePaiement.json();
        if (!reponsePaiement.ok || !dataPaiement.url) {
          setErreur(dataPaiement.error ?? "Impossible de démarrer le paiement en ligne.");
          return;
        }
        try {
          sessionStorage.removeItem(CLE_PANIER_PUBLIC);
        } catch {
          // Non bloquant : au pire le panier soumis réapparaît si le client revient en arrière.
        }
        window.location.href = dataPaiement.url;
        return;
      }

      try {
        sessionStorage.removeItem(CLE_PANIER_PUBLIC);
      } catch {
        // Non bloquant : au pire le panier soumis réapparaît si le client revient en arrière.
      }
      router.push(`/commande-confirmee?canal=${canal}&commande=${data.commandeId}`);
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
          <span className="ml-auto font-medium text-gray-900">{(prixLigne(l) * l.quantite).toFixed(2)} €</span>
        </div>
      </li>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: FOND_PAGE }}>
      <div className="mx-auto max-w-lg space-y-6 p-4">
        {parametres.remiseLancementActive && (
          <div className="rounded-lg p-3 text-white" style={{ backgroundColor: ROUGE }}>
            <p className="font-bold">
              🚀 Lancement 3sauces.fr — -{MONTANT_REMISE_LANCEMENT}€ dès {SEUIL_REMISE_LANCEMENT}€ d&apos;achat,
              jusqu&apos;au {parametres.remiseLancementFinLibelle}
            </p>
          </div>
        )}
        <div className="rounded-lg p-3 text-white" style={{ backgroundColor: VERT }}>
          <p className="font-bold">🚀 Commandez en groupe !</p>
          <p className="mt-0.5 text-sm text-white/90">
            {SEUIL_GROUPE_3_PLATS} plats dès {SEUIL_GROUPE_3_MONTANT}€ : livraison prioritaire.
            <br />
            {SEUIL_GROUPE_4_PLATS} plats dès {SEUIL_GROUPE_4_MONTANT}€ : livraison prioritaire + boisson 2L offerte.
            <br />
            Une seule commande • Une seule adresse.
          </p>
        </div>

        {modeCommande === null ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-center font-semibold text-gray-900">Vous commandez pour vous, ou en groupe ?</p>
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
          <>
            <button
              type="button"
              onClick={retourChoixMode}
              className="text-sm font-semibold text-gray-500 underline"
            >
              ← Changer de mode ({modeCommande === "groupee" ? "commande groupée" : "commande simple"})
            </button>

            {modeCommande === "groupee" && (
              <div className="rounded-lg border border-[#8B2020] bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">
                  Tu remplis actuellement :{" "}
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
                            onClick={() => produit.stockJour !== 0 && surClicProduit(produit)}
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
                            <div className="mt-1 font-semibold text-gray-900">{produit.prix.toFixed(2)} €</div>
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
                          onClick={() => produit.stockJour !== 0 && surClicProduit(produit)}
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
                          <div className="mt-1 font-semibold text-gray-900">{produit.prix.toFixed(2)} €</div>
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
                    <p className="text-sm font-semibold text-[#2D5A27]">
                      {SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides === 1
                        ? "Plus qu'un plat pour valider votre commande groupée."
                        : `Plus que ${SEUIL_COMMANDE_PRIORITAIRE - nbPlatsValides} plats pour valider votre commande groupée.`}
                    </p>
                  )}
                  {nbPlatsValides >= SEUIL_COMMANDE_PRIORITAIRE &&
                    (() => {
                      const palierActuel = palierGroupeActif(nbPlatsValides, total, "livraison");
                      if (palierActuel === "GROUPE_4") {
                        return (
                          <p className="text-sm font-bold text-[#2D5A27]">
                            🚀 Livraison prioritaire + 🎁 boisson 2L offerte (en livraison) !
                          </p>
                        );
                      }
                      if (palierActuel === "GROUPE_3") {
                        const montantRestant = Math.max(0, SEUIL_GROUPE_4_MONTANT - total);
                        return (
                          <p className="text-sm font-semibold text-[#2D5A27]">
                            🚀 Livraison prioritaire activée (en livraison) ! Encore {montantRestant.toFixed(2)}€ pour la
                            boisson 2L offerte.
                          </p>
                        );
                      }
                      const montantRestant = Math.max(0, SEUIL_GROUPE_3_MONTANT - total);
                      if (montantRestant > 0) {
                        return (
                          <p className="text-sm font-semibold text-[#2D5A27]">
                            Encore {montantRestant.toFixed(2)}€ pour la livraison prioritaire 🚀
                          </p>
                        );
                      }
                      return null;
                    })()}
                </>
              )}

              <div className="border-t border-gray-200 pt-3 text-lg font-bold text-gray-900">
                Total : {total.toFixed(2)} €
                {utiliserRecompense && fideliteToken ? (
                  <div className="mt-1 text-sm font-semibold text-[#2D5A27]">
                    Récompense fidélité : −{MONTANT_RECOMPENSE.toFixed(2)} € · Total à payer :{" "}
                    {Math.max(0, total - MONTANT_RECOMPENSE).toFixed(2)} €
                  </div>
                ) : (
                  parametres.remiseLancementActive &&
                  total >= SEUIL_REMISE_LANCEMENT && (
                    <div className="mt-1 text-sm font-semibold text-[#8B2020]">
                      Remise lancement : −{MONTANT_REMISE_LANCEMENT.toFixed(2)} € · Total à payer :{" "}
                      {(total - MONTANT_REMISE_LANCEMENT).toFixed(2)} €
                    </div>
                  )
                )}
              </div>

              <CarteFidelite
                telephoneCommande={telephone}
                montantPanier={total}
                utiliserRecompense={utiliserRecompense}
                onChangeUtiliserRecompense={setUtiliserRecompense}
                onTokenChange={setFideliteToken}
                onPrefillTelephone={(tel) => setTelephone((precedent) => precedent.trim() || tel)}
              />

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

              {palierGroupeReel === "GROUPE_4" && (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-sm font-semibold text-gray-900">🎁 Choisis le parfum de ta boisson 2L offerte</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {parfums2l.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setBoissonOfferteSaveur(s.nom)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
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

              <DatePicker
                dates={datesOuvertes}
                aujourdHui={aujourdHui}
                valeur={dateCommande}
                onChange={changerDate}
                label={canal === "livraison" ? "Date de livraison souhaitée" : "Date de retrait souhaitée"}
              />

              <CreneauPicker
                creneauxValides={creneauxValides}
                valeur={creneauHeure}
                onChange={setCreneauHeure}
                label={canal === "livraison" ? "Créneau de livraison souhaité" : "Heure de passage souhaitée"}
              />

              <div>
                <label className="text-xs text-gray-500">
                  {commandeAvance || modePaiement === "stripe"
                    ? "Paiement"
                    : `Paiement (à la ${canal === "livraison" ? "livraison" : "prise en main"})`}
                </label>
                <select
                  value={commandeAvance ? "stripe" : modePaiement}
                  disabled={commandeAvance}
                  onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900 disabled:bg-gray-100"
                >
                  {!commandeAvance && <option value="especes">Espèces</option>}
                  {!commandeAvance && <option value="cb">Carte (terminal SumUp)</option>}
                  <option value="stripe">Payer en ligne (carte)</option>
                </select>
                {commandeAvance && (
                  <p className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900">
                    Commande à l&apos;avance : le paiement en ligne est requis pour confirmer votre réservation.
                  </p>
                )}
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
                  (modeCommande === "groupee" && nbPlatsValides < SEUIL_COMMANDE_PRIORITAIRE) ||
                  (palierGroupeReel === "GROUPE_4" && !boissonOfferteSaveur)
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
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(
            viandesChoisies,
            saucesChoisies,
            extras,
            boissonIncluse,
            saladeIncluse,
            saladeOption,
            accompagnementsInclus,
            sansBoisson
          ) => {
            ajouterAuPanier(
              produitEnSelection,
              viandesChoisies,
              saucesChoisies,
              [],
              boissonIncluse,
              1,
              saladeIncluse,
              accompagnementsInclus,
              sansBoisson
            );
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
