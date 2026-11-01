"use client";

import { FAMILLES_BOISSON } from "@/lib/boissons";
import { useEffect, useMemo, useRef, useState } from "react";
import { suivreEvenement, suivrePresence } from "@/lib/suivi/client";
import type { EtapeVisiteur } from "@/lib/suivi/types";
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
  NOM_PRODUIT_MENU_ETUDIANT,
  MONTANT_REDUCTION_SANS_BOISSON,
  MONTANT_SUPPLEMENT_SALADE_ET_BOISSON,
} from "@/lib/commande-publique/types";
import {
  creneauxPourDate,
  prochainesDatesOuvertes,
  dateMayotteIso,
  heureActuelleMayotteMinutes,
} from "@/lib/commande-publique/creneau";
import {
  SEUIL_GROUPE_4_PLATS,
  SEUIL_GROUPE_4_MONTANT,
  NOM_PRODUIT_BOISSON_OFFERTE,
  palierGroupeActif,
  palierGroupeSelonQuantite,
  nombreBoissonsOffertes,
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
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";

interface LignePanierPublique {
  id: string;
  produit: ProduitPublic;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
  sansBoisson: boolean;
  sansSauce: boolean;
  saladeOption: boolean;
  saladeIncluse: boolean | null;
  accompagnementsInclus: string[];
}

interface CommandeNouvelleAppProps {
  produits: ProduitPublic[];
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  saveurs: SaveurPublique[];
  /** Parfums de la Boisson 2L — référentiel indépendant de `saveurs` (canettes). */
  parfums2l: SaveurPublique[];
  parametres: ParametresLivraisonPublic;
}

type Onglet = "plats" | "tacos" | "barquettes" | "grillades";
type Vue = "menu" | "panier" | "validation";

const ROUGE = "#8B2020";
const VERT = "#2D5A27";
const FOND_PAGE = "#F5F0E8";

/** Panier en cours : survit à un rechargement de l'onglet, jamais à une nouvelle visite. */
const CLE_PANIER = "3sauces_nouvelle_commande_panier";
/** Identité mémorisée sur l'appareil (jamais envoyée ailleurs que dans la commande). */
const CLE_IDENTITE = "3sauces_identite_client";

const euros = (montant: number) => `${montant.toFixed(2).replace(".", ",")} €`;

function Titre({ children, couleur = ROUGE, sousTitre }: { children: string; couleur?: string; sousTitre?: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-white" style={{ backgroundColor: couleur }}>
      <p className="text-base font-extrabold">{children}</p>
      {sousTitre && <p className="text-sm font-medium text-white">{sousTitre}</p>}
    </div>
  );
}

function BoutonPlus({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl font-bold leading-none text-white shadow-sm active:scale-95 disabled:opacity-30"
      style={{ backgroundColor: ROUGE }}
    >
      +
    </button>
  );
}

function Stepper({
  quantite,
  onMoins,
  onPlus,
  label,
  plusDesactive,
}: {
  quantite: number;
  onMoins: () => void;
  onPlus: () => void;
  label: string;
  plusDesactive?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onMoins}
        aria-label={`Retirer ${label}`}
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-2xl font-bold leading-none active:scale-95"
        style={{ borderColor: ROUGE, color: ROUGE }}
      >
        −
      </button>
      <span className="w-7 text-center text-base font-extrabold text-gray-900">{quantite}</span>
      <BoutonPlus onClick={onPlus} label={`Ajouter ${label}`} disabled={plusDesactive} />
    </div>
  );
}

export function CommandeNouvelleApp({
  produits,
  viandes,
  sauces,
  saveurs,
  parfums2l,
  parametres,
}: CommandeNouvelleAppProps) {
  const router = useRouter();

  const aujourdHui = useMemo(() => dateMayotteIso(), []);
  const datesOuvertes = useMemo(
    () => prochainesDatesOuvertes(parametres.joursFermeture, parametres.heureDebut, parametres.heureFin),
    [parametres.joursFermeture, parametres.heureDebut, parametres.heureFin]
  );

  const [vue, setVue] = useState<Vue>("menu");
  const [onglet, setOnglet] = useState<Onglet | null>(null);
  const [autresBoissonsOuvert, setAutresBoissonsOuvert] = useState(false);
  const [panier, setPanier] = useState<LignePanierPublique[]>([]);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  const [produitEnQuantite, setProduitEnQuantite] = useState<ProduitPublic | null>(null);
  const [ligneCorrectionBoisson, setLigneCorrectionBoisson] = useState<LignePanierPublique | null>(null);
  // Aucun canal présélectionné : le client doit cliquer explicitement (cf. ancien site, 2026-10-07).
  const [canal, setCanal] = useState<CanalPublic | null>(null);
  const [boissonOfferteSaveurs, setBoissonOfferteSaveurs] = useState<string[]>([]);

  const [pretPourPersistance, setPretPourPersistance] = useState(false);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [emailDejaConnu, setEmailDejaConnu] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const brut = sessionStorage.getItem(CLE_PANIER);
        if (brut) {
          const etat = JSON.parse(brut);
          if (Array.isArray(etat.panier)) setPanier(etat.panier);
          if (Array.isArray(etat.boissonOfferteSaveurs)) setBoissonOfferteSaveurs(etat.boissonOfferteSaveurs);
        }
      } catch {
        // sessionStorage indisponible ou corrompu : on repart d'un panier vide.
      }
      try {
        const identite = localStorage.getItem(CLE_IDENTITE);
        if (identite) {
          const i = JSON.parse(identite);
          if (typeof i.telephone === "string") setTelephone(i.telephone);
          if (typeof i.prenom === "string") setPrenom(i.prenom);
          if (typeof i.nom === "string") setNom(i.nom);
        }
      } catch {
        // Identité non mémorisée : le client la saisit simplement.
      }
      setPretPourPersistance(true);
    });
  }, []);

  useEffect(() => {
    if (!pretPourPersistance) return;
    try {
      sessionStorage.setItem(CLE_PANIER, JSON.stringify({ panier, boissonOfferteSaveurs }));
    } catch {
      // Stockage plein ou indisponible : la session continue sans persistance.
    }
  }, [pretPourPersistance, panier, boissonOfferteSaveurs]);

  // Un email déjà enregistré pour ce numéro n'est pas redemandé (oui/non seulement, cf. /api/commande/email-connu).
  useEffect(() => {
    let annule = false;
    const telephoneComplet = normaliserTelephone(telephone);
    const minuteur = setTimeout(async () => {
      if (!telephoneComplet) {
        if (!annule) setEmailDejaConnu(false);
        return;
      }
      try {
        const reponse = await fetch(`/api/commande/email-connu?telephone=${encodeURIComponent(telephoneComplet)}`);
        if (annule) return;
        const data = await reponse.json();
        setEmailDejaConnu(Boolean(data.emailConnu));
      } catch {
        // Échec silencieux : le pire cas est de redemander l'email.
      }
    }, 400);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [telephone]);

  const [adresse, setAdresse] = useState("");
  const [zone, setZone] = useState(parametres.zonesActives[0] ?? "");
  const [dateCommande, setDateCommande] = useState(() => datesOuvertes[0] ?? aujourdHui);
  const creneauxValides = useMemo(
    () => creneauxPourDate(dateCommande, parametres.heureDebut, parametres.heureFin),
    [dateCommande, parametres.heureDebut, parametres.heureFin]
  );
  const [creneauHeure, setCreneauHeure] = useState(() => creneauxValides[0] ?? "");
  const [choisirHeure, setChoisirHeure] = useState(false);
  const commandeAvance = dateCommande !== aujourdHui;
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [fideliteVerifiee, setFideliteVerifiee] = useState<{ telephone: string; email: string; tamponsDisponibles: number } | null>(
    null
  );
  const [nbTampons, setNbTampons] = useState(0);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [accepteCgv, setAccepteCgv] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  // Suivi anonyme (voir lib/suivi) : jamais de donnée personnelle, jamais d'effet sur la commande.
  const etapeSuivie: EtapeVisiteur = envoiEnCours ? "validation" : panier.length > 0 ? "panier" : "menu";
  const etapeSuivieRef = useRef(etapeSuivie);
  const lignesConnuesSuivi = useRef<Set<string> | null>(null);
  useEffect(() => {
    suivreEvenement("visite");
    const minuteur = setInterval(() => {
      if (document.visibilityState === "visible") suivrePresence(etapeSuivieRef.current);
    }, 20_000);
    return () => clearInterval(minuteur);
  }, []);
  useEffect(() => {
    etapeSuivieRef.current = etapeSuivie;
    suivrePresence(etapeSuivie);
  }, [etapeSuivie]);
  useEffect(() => {
    if (!pretPourPersistance) return;
    const connues = lignesConnuesSuivi.current;
    lignesConnuesSuivi.current = new Set(panier.map((l) => l.id));
    if (!connues) return;
    const nouvelles = panier.filter((l) => !connues.has(l.id));
    if (nouvelles.length === 0) return;
    suivreEvenement("ajout_panier");
    for (const l of nouvelles) suivreEvenement("produit_ajoute", l.produit.nom);
  }, [pretPourPersistance, panier]);

  // ---- Catalogue organisé en 4 onglets -----------------------------------
  const menusSpeciaux = useMemo(() => produits.filter((p) => p.categorie === "menu_special"), [produits]);
  const platsDuJour = useMemo(() => produits.filter((p) => p.categorie === "plat_du_jour"), [produits]);
  const groupes = useMemo(() => {
    const snacking = produits.filter((p) => p.categorie === "snacking");
    const nomMin = (p: ProduitPublic) => p.nom.toLowerCase();
    return {
      tacos: snacking.filter((p) => nomMin(p).includes("tacos") && !nomMin(p).includes("bowl")),
      barquettes: snacking.filter((p) => nomMin(p).includes("barquette")),
      bowls: snacking.filter((p) => nomMin(p).includes("bowl")),
      grillades: produits.filter((p) => p.categorie === "grillade"),
      accompagnements: produits.filter((p) => p.categorie === "accompagnement"),
      boissons: produits.filter((p) => p.categorie === "boisson" && p.nom !== NOM_PRODUIT_BOISSON_OFFERTE),
    };
  }, [produits]);

  const onglets = useMemo(() => {
    const liste: { cle: Onglet; titre: string }[] = [];
    if (platsDuJour.length > 0) liste.push({ cle: "plats", titre: "Plats du jour" });
    if (groupes.tacos.length + menusSpeciaux.length > 0) liste.push({ cle: "tacos", titre: "Tacos" });
    if (groupes.barquettes.length + groupes.bowls.length > 0) liste.push({ cle: "barquettes", titre: "Barquettes & Bowls" });
    if (groupes.grillades.length + groupes.accompagnements.length > 0)
      liste.push({ cle: "grillades", titre: "Grillades & accompagnements" });
    return liste;
  }, [platsDuJour, groupes, menusSpeciaux]);
  const ongletActif: Onglet | null = onglet && onglets.some((o) => o.cle === onglet) ? onglet : (onglets[0]?.cle ?? null);

  const produitViandeSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  const produitSauceSupplementaire = useMemo(
    () => produits.find((p) => p.nom === NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE) ?? null,
    [produits]
  );
  const accompagnements = useMemo(
    () => produits.filter((p) => p.categorie === "accompagnement" && p.nom !== "Salade"),
    [produits]
  );
  const produitCanetteRapide = useMemo(
    () => produits.find((p) => p.categorie === "boisson" && p.nbSaveursMax > 0 && p.nom !== NOM_PRODUIT_BOISSON_OFFERTE) ?? null,
    [produits]
  );

  // ---- Calculs de prix (identiques à l'ancien site) -------------------------
  const prixLigne = (l: LignePanierPublique) =>
    l.produit.prix +
    (l.produit.canetteIncluse && l.produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && !l.sansBoisson
      ? MONTANT_REDUCTION_SANS_BOISSON
      : 0) +
    (l.saladeOption ? (l.produit.saladePrixOption ?? 0) : 0) +
    (l.produit.saladeOuBoisson && l.saladeIncluse === true && l.boissonIncluse ? MONTANT_SUPPLEMENT_SALADE_ET_BOISSON : 0);

  const total = panier.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const nbArticles = panier.reduce((acc, l) => acc + l.quantite, 0);
  const maxTamponsUtilisables = Math.min(fideliteVerifiee?.tamponsDisponibles ?? 0, Math.floor(total / MONTANT_RECOMPENSE));
  const nbTamponsEffectif = Math.min(nbTampons, maxTamponsUtilisables);
  const palierGroupeReel = palierGroupeActif(nbArticles, total, heureActuelleMayotteMinutes());
  const groupeTropTard = palierGroupeReel === null && palierGroupeSelonQuantite(nbArticles, total) !== null;
  const nbBoissonsOffertes = nombreBoissonsOffertes(nbArticles, total);
  const boissonsOffertesAChoisir =
    palierGroupeReel === "GROUPE_4"
      ? Math.max(0, nbBoissonsOffertes - boissonOfferteSaveurs.slice(0, nbBoissonsOffertes).filter(Boolean).length)
      : 0;
  const livraisonPossible = parametres.livraisonActive && parametres.zonesActives.length > 0;
  const totalApresTampons = Math.max(0, total - nbTamponsEffectif * MONTANT_RECOMPENSE);
  const minimumAtteint = totalApresTampons >= parametres.minimumCommande;
  const avantDixHeures = heureActuelleMayotteMinutes() < 11 * 60;

  // Progression vers la boisson 2 L offerte : visible seulement tant que l'offre peut encore s'obtenir (avant 11h).
  const progressionOffre = useMemo(() => {
    if (!avantDixHeures || palierGroupeReel === "GROUPE_4") return null;
    const montantRestant = Math.max(0, SEUIL_GROUPE_4_MONTANT - total);
    const platsRestants = Math.max(0, SEUIL_GROUPE_4_PLATS - nbArticles);
    return {
      pourcentage: Math.min(100, Math.round((total / SEUIL_GROUPE_4_MONTANT) * 100)),
      montantRestant,
      platsRestants,
    };
  }, [avantDixHeures, palierGroupeReel, total, nbArticles]);

  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function declencherPulse() {
    setPulse(true);
    if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    pulseTimeout.current = setTimeout(() => setPulse(false), 250);
  }

  function changerDate(nouvelleDate: string) {
    setDateCommande(nouvelleDate);
    const creneaux = creneauxPourDate(nouvelleDate, parametres.heureDebut, parametres.heureFin);
    setCreneauHeure(creneaux.includes(creneauHeure) ? creneauHeure : (creneaux[0] ?? ""));
    if (nouvelleDate !== aujourdHui) setModePaiement("stripe");
  }

  function plafonnerQuantite(produit: { id: string; stockJour: number | null }, ligneId: string | null, quantiteVoulue: number): number {
    if (produit.stockJour === null) return quantiteVoulue;
    const dejaAuPanier = panier
      .filter((l) => l.produit.id === produit.id && l.id !== ligneId)
      .reduce((somme, l) => somme + l.quantite, 0);
    return Math.max(0, Math.min(quantiteVoulue, produit.stockJour - dejaAuPanier));
  }

  function ajouterAuPanier(
    produit: ProduitPublic,
    viandesChoisies: string[],
    saucesChoisies: string[] = [],
    saveursChoisies: string[] = [],
    boissonIncluse: string | null = null,
    quantite: number = 1,
    saladeIncluse: boolean | null = null,
    accompagnementsInclus: string[] = [],
    sansBoisson: boolean = false,
    sansSauce: boolean = false,
    saladeOption: boolean = false
  ) {
    declencherPulse();
    const memeTri = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const cle = (l: LignePanierPublique) =>
      l.produit.id === produit.id &&
      memeTri(l.viandes, viandesChoisies) &&
      memeTri(l.sauces, saucesChoisies) &&
      memeTri(l.saveurs, saveursChoisies) &&
      l.boissonIncluse === boissonIncluse &&
      l.sansBoisson === sansBoisson &&
      l.sansSauce === sansSauce &&
      l.saladeOption === saladeOption &&
      l.saladeIncluse === saladeIncluse &&
      memeTri(l.accompagnementsInclus, accompagnementsInclus);

    const stockRestantAvantAjout = produit.stockJour !== null ? plafonnerQuantite(produit, null, produit.stockJour) : null;
    if (stockRestantAvantAjout !== null && quantite > stockRestantAvantAjout) {
      window.alert(
        stockRestantAvantAjout > 0
          ? `Il ne reste que ${stockRestantAvantAjout} ${produit.nom} disponible(s) aujourd'hui (déjà dans ton panier compris).`
          : `${produit.nom} est épuisé pour aujourd'hui, ou déjà entièrement dans ton panier.`
      );
    }

    setPanier((precedent) => {
      const existante = precedent.find(cle);
      if (existante) {
        return precedent.map((l) =>
          l === existante ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + quantite) } : l
        );
      }
      const quantiteAjoutee = plafonnerQuantite(produit, null, quantite);
      if (quantiteAjoutee <= 0) return precedent;
      return [
        ...precedent,
        {
          id: `${produit.id}-${Date.now()}-${Math.random()}`,
          produit,
          quantite: quantiteAjoutee,
          viandes: viandesChoisies,
          sauces: saucesChoisies,
          saveurs: saveursChoisies,
          boissonIncluse,
          sansBoisson,
          sansSauce,
          saladeOption,
          saladeIncluse,
          accompagnementsInclus,
        },
      ];
    });
  }

  function surClicProduit(produit: ProduitPublic) {
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
    setPanier((precedent) =>
      precedent
        .map((l) => (l.id === id ? { ...l, quantite: plafonnerQuantite(l.produit, l.id, l.quantite + delta) } : l))
        .filter((l) => l.quantite > 0)
    );
  }

  function ligneAuPanierDirect(produitId: string, saveur: string | null) {
    return panier.find((l) => l.produit.id === produitId && (l.saveurs[0] ?? null) === saveur);
  }

  function quantiteProduit(produitId: string) {
    return panier.filter((l) => l.produit.id === produitId).reduce((somme, l) => somme + l.quantite, 0);
  }

  function appliquerBoisson(id: string, saveur: string | null) {
    setPanier((precedent) => precedent.map((l) => (l.id === id ? { ...l, sansBoisson: false, boissonIncluse: saveur } : l)));
    setLigneCorrectionBoisson(null);
  }

  function completerBoisson(ligne: LignePanierPublique) {
    if (saveurs.length > 1) {
      setLigneCorrectionBoisson(ligne);
      return;
    }
    appliquerBoisson(ligne.id, saveurs[0]?.nom ?? null);
  }

  function retirerBoisson(id: string) {
    setPanier((precedent) => precedent.map((l) => (l.id === id ? { ...l, sansBoisson: true, boissonIncluse: null } : l)));
  }

  function aller(nouvelleVue: Vue) {
    setErreur(null);
    setVue(nouvelleVue);
    window.scrollTo({ top: 0 });
  }

  async function commander() {
    setErreur(null);

    if (nbArticles === 0) {
      setErreur("Ton panier est vide.");
      return;
    }
    if (palierGroupeReel === "GROUPE_4" && boissonOfferteSaveurs.slice(0, nbBoissonsOffertes).filter(Boolean).length < nbBoissonsOffertes) {
      setErreur("Choisis le parfum de ta boisson 2L offerte avant de valider.");
      return;
    }
    if (!canal) {
      setErreur("Choisis comment récupérer ta commande : sur place, à emporter ou en livraison.");
      return;
    }
    if (!prenom.trim()) {
      setErreur("Indique ton prénom.");
      return;
    }
    if (!nom.trim()) {
      setErreur("Indique ton nom.");
      return;
    }
    const telephoneComplet = normaliserTelephone(telephone);
    if (!telephone.trim()) {
      setErreur("Indique ton numéro de téléphone.");
      return;
    }
    if (!telephoneComplet) {
      setErreur("Numéro de téléphone invalide — vérifie que tu l'as bien saisi (ex: 0639123456).");
      return;
    }
    let emailValide: string | null = null;
    if (email.trim()) {
      emailValide = normaliserEmail(email);
      if (!emailValide) {
        setErreur("Indique une adresse email valide.");
        return;
      }
    } else if (!emailDejaConnu) {
      setErreur("Indique ton adresse email.");
      return;
    }
    if (canal === "livraison") {
      if (!livraisonPossible) {
        setErreur("La livraison n'est pas disponible pour le moment — choisis sur place ou à emporter.");
        return;
      }
      if (!adresse.trim()) {
        setErreur("Indique ton adresse de livraison.");
        return;
      }
      if (!minimumAtteint) {
        setErreur(`Minimum ${euros(parametres.minimumCommande)} pour la livraison. Choisis le retrait sur place ou ajoute des articles.`);
        return;
      }
    }
    if (!accepteCgv) {
      setErreur("Tu dois accepter les CGV et la politique de confidentialité.");
      return;
    }

    setEnvoiEnCours(true);
    try {
      const lignes = panier.map((l) => ({
        produitId: l.produit.id,
        quantite: l.quantite,
        viandes: l.viandes,
        sauces: l.sauces,
        saveurs: l.saveurs,
        boissonIncluse: l.boissonIncluse,
        sansBoisson: l.sansBoisson,
        sansSauce: l.sansSauce,
        saladeOption: l.saladeOption,
        saladeIncluse: l.saladeIncluse,
        accompagnementsInclus: l.accompagnementsInclus,
        platIndex: null,
        pourQui: null,
      }));

      const modePaiementEffectif: ModePaiement = commandeAvance ? "stripe" : modePaiement;

      const reponse = await fetch("/api/commande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          nom: nom.trim(),
          prenom: prenom.trim(),
          email: emailValide,
          telephone: telephoneComplet,
          modePaiement: modePaiementEffectif,
          creneauHeure,
          date: dateCommande,
          adresse: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          consentementCgv: accepteCgv,
          lignes,
          fideliteTelephone: nbTamponsEffectif > 0 ? fideliteVerifiee?.telephone : undefined,
          fideliteEmail: nbTamponsEffectif > 0 ? fideliteVerifiee?.email : undefined,
          nbTampons: nbTamponsEffectif,
          boissonOfferteSaveurs: palierGroupeReel === "GROUPE_4" ? boissonOfferteSaveurs.slice(0, nbBoissonsOffertes) : undefined,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'envoi de la commande.");
        return;
      }

      suivreEvenement("commande_validee");
      try {
        localStorage.setItem(CLE_IDENTITE, JSON.stringify({ telephone: telephone.trim(), prenom: prenom.trim(), nom: nom.trim() }));
      } catch {
        // Non bloquant : le client retapera son numéro la prochaine fois.
      }

      if (modePaiementEffectif === "stripe") {
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
          sessionStorage.removeItem(CLE_PANIER);
        } catch {
          // Non bloquant.
        }
        window.location.href = dataPaiement.url;
        return;
      }

      try {
        sessionStorage.removeItem(CLE_PANIER);
      } catch {
        // Non bloquant.
      }
      router.push(`/commande-confirmee?canal=${canal}&commande=${data.commandeId}`);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  // ---- Briques d'affichage ----------------------------------------------------

  /** Ligne produit à configurer : toute la ligne s'ouvre, le « + » rond sert de repère. */
  function ligneProduit(produit: ProduitPublic, etiquette?: string) {
    const epuise = produit.stockJour === 0;
    const q = quantiteProduit(produit.id);
    return (
      <div key={produit.id} className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-3 last:border-0">
        <button
          type="button"
          onClick={() => !epuise && surClicProduit(produit)}
          disabled={epuise}
          className="min-w-0 flex-1 text-left disabled:opacity-60"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold leading-tight text-gray-900">{produit.nom}</span>
            {etiquette && (
              <span className="rounded-full bg-[#2D5A27] px-2 py-0.5 text-xs font-bold text-white">{etiquette}</span>
            )}
            {q > 0 && <span className="rounded-full bg-[#8B2020] px-2 py-0.5 text-xs font-bold text-white">×{q}</span>}
          </span>
          {produit.description && <span className="mt-0.5 block text-sm leading-snug text-gray-800">{produit.description}</span>}
          {epuise ? (
            <span className="mt-0.5 block text-sm font-bold text-red-700">Épuisé aujourd&apos;hui</span>
          ) : (
            <span className="mt-0.5 block whitespace-nowrap text-base font-extrabold text-gray-900">{euros(produit.prix)}</span>
          )}
          {produit.stockJour !== null && produit.stockJour > 0 && produit.stockJour <= 3 && (
            <span className="block text-sm font-bold text-orange-700">Plus que {produit.stockJour} !</span>
          )}
        </button>
        <BoutonPlus onClick={() => surClicProduit(produit)} label={`Choisir ${produit.nom}`} disabled={epuise} />
      </div>
    );
  }

  /** Ligne sans choix (grillade, accompagnement, boisson) : « + » ajoute tout de suite, compteur dès le premier ajout. */
  function ligneDirecte(produit: ProduitPublic, saveur: string | null) {
    const ligne = ligneAuPanierDirect(produit.id, saveur);
    const q = ligne?.quantite ?? 0;
    const pieces = piecesParPaquet(produit.nom);
    const epuise = produit.stockJour === 0;
    return (
      <div key={saveur ? `${produit.id}::${saveur}` : produit.id} className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2.5 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight text-gray-900">{saveur ?? produit.nom}</p>
          <p className={`whitespace-nowrap text-base font-extrabold ${epuise ? "text-red-700" : "text-gray-900"}`}>
            {epuise ? "Épuisé aujourd'hui" : euros(produit.prix)}
          </p>
        </div>
        {q > 0 && ligne ? (
          <Stepper
            quantite={q * pieces}
            onMoins={() => modifierQuantite(ligne.id, -1)}
            onPlus={() => ajouterAuPanier(produit, [], [], saveur ? [saveur] : [])}
            label={saveur ?? produit.nom}
          />
        ) : (
          <BoutonPlus
            onClick={() => ajouterAuPanier(produit, [], [], saveur ? [saveur] : [])}
            label={`Ajouter ${saveur ?? produit.nom}`}
            disabled={epuise}
          />
        )}
      </div>
    );
  }

  function listeDirecte(liste: ProduitPublic[]) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-300">
        {liste.flatMap((produit) =>
          produit.nbSaveursMax > 0
            ? saveurs.map((s) => ligneDirecte(produit, s.nom))
            : [ligneDirecte(produit, null)]
        )}
      </div>
    );
  }

  /** « Avec ça ? » : canettes en un clic, le reste des boissons derrière « Autres ». */
  function blocBoissons() {
    if (groupes.boissons.length === 0) return null;
    const familles = [
      ...FAMILLES_BOISSON.map((f) => ({
        cle: f.valeur as string,
        titre: f.libelle,
        liste: groupes.boissons.filter((p) => p.familleBoisson === f.valeur),
      })),
      { cle: "autres", titre: "Autres boissons", liste: groupes.boissons.filter((p) => !p.familleBoisson) },
    ].filter((g) => g.liste.length > 0);
    return (
      <div className="rounded-lg border border-gray-300 bg-white p-3">
        {produitCanetteRapide && (
          <>
            <p className="text-base font-extrabold text-gray-900">
              Boissons · canette 33 cl <span style={{ color: ROUGE }}>{euros(produitCanetteRapide.prix)}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {saveurs.map((s) => {
                const q = ligneAuPanierDirect(produitCanetteRapide.id, s.nom)?.quantite ?? 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => ajouterAuPanier(produitCanetteRapide, [], [], [s.nom])}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-bold active:scale-95 ${
                      q > 0 ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                    }`}
                  >
                    {s.nom}
                    {q > 0 ? ` ×${q}` : ""}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setAutresBoissonsOuvert((o) => !o)}
          className="mt-3 w-full rounded-lg border-2 border-dashed border-gray-500 py-2 text-sm font-bold text-gray-900"
        >
          {autresBoissonsOuvert ? "Masquer les autres boissons" : "Autres : 2 L, 50 cl, eau"}
        </button>
        {autresBoissonsOuvert && (
          <div className="mt-3 space-y-3">
            {familles.map((g) => (
              <div key={g.cle}>
                <p className="mb-1 text-sm font-extrabold uppercase tracking-wide text-gray-900">{g.titre}</p>
                {listeDirecte(g.liste)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function contenuOnglet() {
    if (ongletActif === "plats") {
      return (
        <div className="space-y-4">
          {platsDuJour.map((produit) => {
            const epuise = produit.stockJour === 0;
            const q = quantiteProduit(produit.id);
            return (
              <div key={produit.id} className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
                <div className="flex h-28 items-center justify-center bg-[#E8DFD0] text-sm font-bold text-gray-700">
                  Photo à venir
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg font-extrabold leading-tight text-gray-900">{produit.nom}</p>
                    <p className="whitespace-nowrap text-lg font-extrabold" style={{ color: ROUGE }}>
                      {euros(produit.prix)}
                    </p>
                  </div>
                  {produit.description && <p className="text-sm text-gray-800">{produit.description}</p>}
                  {epuise && <p className="text-sm font-bold text-red-700">Épuisé aujourd&apos;hui</p>}
                  {produit.stockJour !== null && produit.stockJour > 0 && produit.stockJour <= 3 && (
                    <p className="text-sm font-bold text-orange-700">Plus que {produit.stockJour} !</p>
                  )}
                  <button
                    type="button"
                    onClick={() => surClicProduit(produit)}
                    disabled={epuise}
                    className="mt-2 w-full rounded-lg py-3 text-base font-extrabold text-white active:scale-[0.99] disabled:opacity-40"
                    style={{ backgroundColor: ROUGE }}
                  >
                    {q > 0 ? `Ajouter encore (déjà ×${q})` : "Ajouter"}
                  </button>
                </div>
              </div>
            );
          })}
          {blocBoissons()}
        </div>
      );
    }
    if (ongletActif === "tacos") {
      return (
        <div className="space-y-4">
          {menusSpeciaux.length > 0 && (
            <div>
              <Titre couleur={VERT}>Menus</Titre>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-300">
                {menusSpeciaux.map((p) => ligneProduit(p, "Menu"))}
              </div>
            </div>
          )}
          {groupes.tacos.length > 0 && (
            <div>
              <Titre>Tacos</Titre>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-300">
                {groupes.tacos.map((p) => ligneProduit(p))}
              </div>
            </div>
          )}
          {blocBoissons()}
        </div>
      );
    }
    if (ongletActif === "barquettes") {
      return (
        <div className="space-y-4">
          {groupes.barquettes.length > 0 && (
            <div>
              <Titre couleur={VERT} sousTitre="Frites, salade, sauces et viande">
                Barquettes
              </Titre>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-300">
                {groupes.barquettes.map((p) => ligneProduit(p))}
              </div>
            </div>
          )}
          {groupes.bowls.length > 0 && (
            <div>
              <Titre sousTitre="Frites, sauce fromagère, sauces et viande">Tacos Bowls</Titre>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-300">
                {groupes.bowls.map((p) => ligneProduit(p))}
              </div>
            </div>
          )}
          {blocBoissons()}
        </div>
      );
    }
    if (ongletActif === "grillades") {
      return (
        <div className="space-y-4">
          {groupes.grillades.length > 0 && (
            <div>
              <Titre>Grillades</Titre>
              <div className="mt-2">{listeDirecte(groupes.grillades)}</div>
            </div>
          )}
          {groupes.accompagnements.length > 0 && (
            <div>
              <Titre couleur={VERT}>Accompagnements</Titre>
              <div className="mt-2">{listeDirecte(groupes.accompagnements)}</div>
            </div>
          )}
          {blocBoissons()}
        </div>
      );
    }
    return null;
  }

  function lignePanier(l: LignePanierPublique) {
    return (
      <li key={l.id} className="rounded-lg border border-gray-300 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold leading-tight text-gray-900">{l.produit.nom}</p>
          <p className="whitespace-nowrap text-base font-extrabold text-gray-900">{euros(prixLigne(l) * l.quantite)}</p>
        </div>
        <div className="mt-1 space-y-0.5 text-sm text-gray-800">
          {l.viandes.length > 0 && <p>{l.viandes.join(", ")}</p>}
          {l.saveurs.length > 0 && <p>{l.saveurs.join(", ")}</p>}
          {l.sauces.length > 0 && <p>Sauces : {l.sauces.join(", ")}</p>}
          {l.sansSauce && <p className="font-semibold">Sans sauce</p>}
          {l.saladeOption && <p>+ Salade (+{euros(l.produit.saladePrixOption ?? 0)})</p>}
          {l.accompagnementsInclus.length > 0 && (
            <p>Accompagnement : {l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}</p>
          )}
          {l.saladeIncluse !== null && <p>{l.saladeIncluse ? "Avec salade" : "Sans salade"}</p>}
          {l.boissonIncluse && (
            <p>
              Boisson incluse : {l.boissonIncluse}
              {l.produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && l.produit.canetteIncluse && (
                <button type="button" onClick={() => retirerBoisson(l.id)} className="ml-2 font-semibold text-orange-700 underline">
                  Retirer (−{euros(MONTANT_REDUCTION_SANS_BOISSON)})
                </button>
              )}
            </p>
          )}
          {l.sansBoisson && (
            <p className="font-semibold text-orange-700">
              Sans boisson (−{euros(MONTANT_REDUCTION_SANS_BOISSON)}){" "}
              <button type="button" onClick={() => completerBoisson(l)} className="underline">
                + Ajouter la boisson (+{euros(MONTANT_REDUCTION_SANS_BOISSON)})
              </button>
            </p>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Stepper
            quantite={l.quantite}
            onMoins={() => modifierQuantite(l.id, -1)}
            onPlus={() => modifierQuantite(l.id, 1)}
            label={l.produit.nom}
          />
          <button type="button" onClick={() => setPanier((p) => p.filter((x) => x.id !== l.id))} className="text-sm font-semibold text-gray-800 underline">
            Supprimer
          </button>
        </div>
      </li>
    );
  }

  const aDejaUneBoisson = panier.some((l) => l.produit.categorie === "boisson" || l.boissonIncluse);
  const messageTotalApayer =
    nbTamponsEffectif > 0
      ? `${nbTamponsEffectif} tampon${nbTamponsEffectif > 1 ? "s" : ""} fidélité : −${euros(nbTamponsEffectif * MONTANT_RECOMPENSE)}`
      : parametres.remiseLancementActive && total >= SEUIL_REMISE_LANCEMENT
        ? `Remise lancement : −${euros(MONTANT_REMISE_LANCEMENT)}`
        : null;

  const libelleQuand = commandeAvance
    ? `Le ${new Date(`${dateCommande}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`
    : "Aujourd'hui";

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: FOND_PAGE }}>
      {/* Bandeau fidélité : toujours visible */}
      <div className="px-4 py-2 text-center text-sm font-bold text-white" style={{ backgroundColor: VERT }}>
        10 € = 1 tampon · 10 tampons = 10 € offerts
      </div>

      {vue === "menu" && (
        <>
          <div className="sticky top-0 z-30 border-b border-gray-300 bg-[#F5F0E8]/95 backdrop-blur">
            <div className="mx-auto flex max-w-lg gap-2 overflow-x-auto px-4 py-2">
              {onglets.map((o) => (
                <button
                  key={o.cle}
                  type="button"
                  onClick={() => setOnglet(o.cle)}
                  className={`shrink-0 whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-extrabold ${
                    ongletActif === o.cle ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                  }`}
                >
                  {o.titre}
                </button>
              ))}
            </div>
          </div>
          <div className="mx-auto max-w-lg space-y-4 p-4">
            {contenuOnglet()}
            <FooterLegal />
          </div>
        </>
      )}

      {vue === "panier" && (
        <div className="mx-auto max-w-lg space-y-4 p-4">
          <button type="button" onClick={() => aller("menu")} className="text-base font-bold text-gray-900 underline">
            ← Continuer mes achats
          </button>
          <h2 className="text-2xl font-extrabold text-gray-900">Ton panier</h2>
          {panier.length === 0 && <p className="text-base text-gray-800">Ton panier est vide.</p>}
          <ul className="space-y-3">{panier.map(lignePanier)}</ul>

          {progressionOffre && nbArticles > 0 && (
            <div className="rounded-lg border-2 border-[#2D5A27] bg-white p-3">
              <p className="text-sm font-extrabold text-gray-900">
                {progressionOffre.montantRestant > 0
                  ? `Plus que ${euros(progressionOffre.montantRestant)} : boisson 2 L offerte`
                  : `Plus que ${progressionOffre.platsRestants} article${progressionOffre.platsRestants > 1 ? "s" : ""} : boisson 2 L offerte`}
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full" style={{ width: `${progressionOffre.pourcentage}%`, backgroundColor: VERT }} />
              </div>
            </div>
          )}
          {palierGroupeReel === "GROUPE_4" && (
            <div className="rounded-lg bg-[#2D5A27] p-3 text-sm font-extrabold text-white">
              Bravo : {nbBoissonsOffertes} boisson{nbBoissonsOffertes > 1 ? "s" : ""} 2 L offerte{nbBoissonsOffertes > 1 ? "s" : ""} !
            </div>
          )}
          {groupeTropTard && (
            <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-950">
              La boisson 2 L offerte est réservée aux commandes passées avant 11h.
            </p>
          )}

          {nbArticles > 0 && !aDejaUneBoisson && produitCanetteRapide && saveurs.length > 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-500 bg-white p-3">
              <p className="text-sm font-extrabold text-gray-900">
                Ajoutez une canette + {euros(produitCanetteRapide.prix)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {saveurs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => ajouterAuPanier(produitCanetteRapide, [], [], [s.nom])}
                    className="rounded-full border-2 border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-900 active:scale-95"
                  >
                    {s.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-white p-4 text-gray-900">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-extrabold">{euros(total)}</span>
            </div>
            {messageTotalApayer && <p className="mt-1 text-sm font-bold text-[#2D5A27]">{messageTotalApayer}</p>}
          </div>

          <button
            type="button"
            onClick={() => aller("validation")}
            disabled={nbArticles === 0}
            className="w-full rounded-xl py-4 text-lg font-extrabold text-white disabled:opacity-40"
            style={{ backgroundColor: ROUGE }}
          >
            Continuer
          </button>
        </div>
      )}

      {vue === "validation" && (
        <div className="mx-auto max-w-lg space-y-5 p-4">
          <button type="button" onClick={() => aller("panier")} className="text-base font-bold text-gray-900 underline">
            ← Retour au panier
          </button>
          <h2 className="text-2xl font-extrabold text-gray-900">Valider ma commande</h2>

          {/* 1. Comment récupérer */}
          <section className="space-y-2 rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-extrabold text-gray-900">1. Comment récupérer ?</h3>
            <div className={`grid grid-cols-3 gap-2 rounded-lg ${canal ? "" : "ring-2 ring-[#8B2020]/50"}`}>
              {(
                [
                  ["sur_place", "Sur place"],
                  ["emporter", "À emporter"],
                  ["livraison", "Livraison"],
                ] as const
              ).map(([valeur, libelle]) => (
                <button
                  key={valeur}
                  type="button"
                  onClick={() => setCanal(valeur)}
                  disabled={valeur === "livraison" && !livraisonPossible}
                  className={`rounded-lg border-2 py-3 text-sm font-extrabold disabled:opacity-30 ${
                    canal === valeur ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                  }`}
                >
                  {libelle}
                </button>
              ))}
            </div>
            {!canal && <p className="text-sm font-semibold" style={{ color: ROUGE }}>Choisis une option pour continuer.</p>}
            {canal === "livraison" && !minimumAtteint && (
              <p className="text-sm font-semibold text-orange-800">
                Minimum {euros(parametres.minimumCommande)} pour la livraison — ajoute des articles ou choisis le retrait.
              </p>
            )}
            {canal === "livraison" && (
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-sm font-semibold text-gray-900">Adresse</label>
                  <input
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-900">Zone</label>
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
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
          </section>

          {/* 2. Quand */}
          <section className="space-y-2 rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-extrabold text-gray-900">2. Quand ?</h3>
            {!choisirHeure ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold text-gray-900">
                  Dès que possible
                  <span className="block text-sm font-medium text-gray-800">
                    {libelleQuand}
                    {creneauHeure ? ` à partir de ${creneauHeure}` : ""}
                  </span>
                </p>
                <button type="button" onClick={() => setChoisirHeure(true)} className="shrink-0 text-sm font-bold text-gray-900 underline">
                  Choisir une heure
                </button>
              </div>
            ) : (
              <div className="space-y-2">
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
              </div>
            )}
          </section>

          {/* 3. Coordonnées */}
          <section className="space-y-3 rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-extrabold text-gray-900">3. Ton téléphone</h3>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              inputMode="tel"
              placeholder="0639123456"
              className="w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
            />
            <p className="text-sm font-medium text-gray-800">Tes tampons sont comptés avec ce numéro.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-semibold text-gray-900">Prénom</label>
                <input
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-900">Nom</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-900">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={emailDejaConnu ? "Laisse vide pour garder ton email déjà enregistré" : "toi@exemple.com"}
                className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
              />
              {emailDejaConnu && <p className="mt-1 text-sm font-semibold text-[#2D5A27]">Email déjà enregistré pour ce numéro : tu peux laisser vide.</p>}
            </div>
            <CarteFidelite
              montantPanier={total}
              nbTampons={nbTamponsEffectif}
              onChangeNbTampons={setNbTampons}
              onSoldeVerifie={(verifie, tel, mail, tamponsDisponibles) =>
                setFideliteVerifiee(verifie && tel && mail ? { telephone: tel, email: mail, tamponsDisponibles: tamponsDisponibles ?? 0 } : null)
              }
              onPrefillIdentite={(infos) => {
                setTelephone((precedent) => precedent.trim() || infos.telephone);
                setEmail((precedent) => precedent.trim() || infos.email);
                if (infos.nom) setNom((precedent) => precedent.trim() || infos.nom!);
                if (infos.prenom) setPrenom((precedent) => precedent.trim() || infos.prenom!);
                if (canal === "livraison") {
                  if (infos.adresse) setAdresse((precedent) => precedent.trim() || infos.adresse!);
                  if (infos.zone) setZone((precedent) => precedent.trim() || infos.zone!);
                }
              }}
            />
          </section>

          {/* Boisson offerte */}
          {palierGroupeReel === "GROUPE_4" && (
            <section
              id="boisson-offerte"
              className={`rounded-xl border-2 p-4 ${boissonsOffertesAChoisir > 0 ? "border-red-700 bg-red-50" : "border-[#2D5A27] bg-green-50"}`}
            >
              <p className="text-base font-extrabold text-gray-900">
                Choisis le parfum de ta boisson 2 L offerte{nbBoissonsOffertes > 1 ? ` (${nbBoissonsOffertes} offertes)` : ""}
              </p>
              {Array.from({ length: nbBoissonsOffertes }, (_, index) => (
                <div key={index} className="mt-2">
                  {nbBoissonsOffertes > 1 && <p className="text-sm font-semibold text-gray-900">Boisson offerte n°{index + 1}</p>}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {parfums2l.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setBoissonOfferteSaveurs((prev) =>
                            Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) => (i === index ? s.nom : prev[i]))
                          )
                        }
                        className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                          boissonOfferteSaveurs[index] === s.nom ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                        }`}
                      >
                        {s.nom}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* 4. Paiement */}
          <section className="space-y-2 rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-extrabold text-gray-900">4. Paiement</h3>
            {commandeAvance ? (
              <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-950">
                Commande à l&apos;avance : le paiement en ligne est requis pour confirmer ta réservation.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    ["especes", canal === "livraison" ? "Espèces à la livraison" : "Espèces au retrait"],
                    ["cb", canal === "livraison" ? "Carte à la livraison" : "Carte au comptoir (terminal)"],
                    ["stripe", "Payer en ligne (carte)"],
                  ] as const
                ).map(([valeur, libelle]) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setModePaiement(valeur)}
                    className={`rounded-lg border-2 px-3 py-3 text-left text-base font-bold ${
                      modePaiement === valeur ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                    }`}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            )}
          </section>

          <label className="flex items-start gap-3 text-sm text-gray-900">
            <input type="checkbox" checked={accepteCgv} onChange={(e) => setAccepteCgv(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0" />
            <span>
              J&apos;accepte les{" "}
              <a href="/cgv" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                CGV
              </a>{" "}
              et la{" "}
              <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                politique de confidentialité
              </a>
              .
            </span>
          </label>

          {erreur && <p className="rounded-lg bg-red-100 p-3 text-sm font-bold text-red-900">{erreur}</p>}

          <button
            type="button"
            onClick={commander}
            disabled={envoiEnCours || nbArticles === 0}
            className="w-full rounded-xl py-4 text-lg font-extrabold text-white disabled:opacity-40"
            style={{ backgroundColor: VERT }}
          >
            {envoiEnCours ? "Envoi…" : `Commander · ${euros(totalApresTampons)}`}
          </button>
          <FooterLegal />
        </div>
      )}

      {/* Barre de panier fixe */}
      {vue === "menu" && nbArticles > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => aller("panier")}
            className={`mx-auto flex w-full max-w-lg items-center justify-between rounded-xl px-5 py-4 text-white shadow-lg transition-transform duration-200 ${
              pulse ? "scale-105" : "scale-100"
            }`}
            style={{ backgroundColor: VERT }}
          >
            <span className="text-base font-extrabold">
              {nbArticles} article{nbArticles > 1 ? "s" : ""}
            </span>
            <span className="text-base font-extrabold">Voir le panier</span>
            <span className="whitespace-nowrap text-base font-extrabold">{euros(total)}</span>
          </button>
        </div>
      )}

      {/* Écrans de choix (réutilisés tels quels pour l'instant) */}
      {produitEnSelection && produitEnSelection.nbSaveursMax > 0 && (
        <SaveurModalPublique
          produit={produitEnSelection}
          saveurs={produitEnSelection.nom === NOM_PRODUIT_BOISSON_OFFERTE ? parfums2l : saveurs}
          onAnnuler={() => setProduitEnSelection(null)}
          onValider={(saveursChoisies) => {
            for (const nomSaveur of saveursChoisies) {
              ajouterAuPanier(produitEnSelection, [], [], [nomSaveur]);
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
            produitEnSelection.stockJour !== null ? plafonnerQuantite(produitEnSelection, null, produitEnSelection.stockJour) : undefined
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
            canettesRapidesChoisies,
            sansSauce
          ) => {
            ajouterAuPanier(
              produitEnSelection,
              viandesChoisies,
              saucesChoisies,
              [],
              boissonIncluse,
              quantite,
              saladeIncluse,
              accompagnementsInclus,
              sansBoisson,
              sansSauce,
              saladeOption
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
            stockJour:
              produitEnQuantite.stockJour !== null ? plafonnerQuantite(produitEnQuantite, null, produitEnQuantite.stockJour) : null,
          }}
          canetteProduit={produitEnQuantite.categorie === "plat_du_jour" ? produitCanetteRapide : null}
          canetteSaveurs={saveurs}
          onAnnuler={() => setProduitEnQuantite(null)}
          onValider={(quantite, _prixSaisi, canettesChoisies) => {
            ajouterAuPanier(produitEnQuantite, produitEnQuantite.viandeImposee ? [produitEnQuantite.viandeImposee] : [], [], [], null, quantite);
            if (produitCanetteRapide) {
              for (const saveur of canettesChoisies ?? []) {
                ajouterAuPanier(produitCanetteRapide, [], [], [saveur], null, 1);
              }
            }
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
                  className="rounded-full border-2 border-gray-400 px-4 py-2 text-sm font-bold text-gray-900"
                >
                  {s.nom}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setLigneCorrectionBoisson(null)} className="mt-4 text-sm font-semibold text-gray-900 underline">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
