"use client";

import { FAMILLES_BOISSON } from "@/lib/boissons";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
  MONTANT_OIGNONS_FRITS,
  supplementBoissonFormule,
  ajustementBoissonFormule,
  saveursFormule,
} from "@/lib/commande-publique/types";
import {
  creneauxPourDate,
  prochainesDatesOuvertes,
  dateMayotteIso,
} from "@/lib/commande-publique/creneau";
import {
  SEUIL_GROUPE_4_MONTANT,
  NOM_PRODUIT_BOISSON_OFFERTE,
  palierGroupeActif,
  nombreBoissonsOffertes,
} from "@/lib/commande-publique/groupe-priorite";
import { FooterLegal } from "@/components/legal/footer-legal";
import { ConfigurateurNouveau } from "./configurateur-nouveau";
import { SaveurModalPublique } from "./saveur-modal-publique";
import { LIEUX_PRINCIPAUX, VILLAGES, creneauxLivraisonPossibles, libelleCreneauLieu, lieuPrincipalDeAdresse, trouverLieu } from "@/lib/commande-publique/lieux-livraison";
import { CreneauPicker } from "./creneau-picker";
import { DatePicker } from "./date-picker";
import { CarteFidelite } from "./carte-fidelite";
import { MONTANT_RECOMPENSE, NB_TAMPONS_RECOMPENSE, calculerProgressionCommande, progressionTampons, texteProgressionCommande } from "@/lib/fidelite/regles";
import { MONTANT_PAR_CANETTE_OFFERTE, nombreCanettesOffertes, offreCanetteActive } from "@/lib/commande-publique/offre-canette";
import { nombreBoxOffertes, NB_SAUCES_CADEAU, offreCadeauActive, SEUIL_OFFRE_CADEAU } from "@/lib/commande-publique/offre-cadeau";
import { CLE_SOURCE_CAMPAGNE, DUREE_SOURCE_CAMPAGNE_MS, normaliserSourceCampagne } from "@/lib/campagne";
import { MessageErreur } from "@/components/message-erreur";
import { pointsDoublesPossibles } from "@/lib/fidelite/jours-points-doubles";
import { ProfilClientChoix } from "@/components/profil-client-choix";
import type { ProfilClient } from "@/lib/profil-client";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { SEUIL_MINIMUM_PLAT } from "@/lib/plats";
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
  /** Viandes / sauces en supplément payant, intégrées à la ligne (jamais des produits à part). */
  viandesSupp: string[];
  saucesSupp: string[];
  oignonsFrits: boolean;
  /** Unités ajoutées depuis le bloc « Et avec ça ? » (suivi des ventes complémentaires). */
  quantiteSuggeree?: number;
  /** Index du plat (0 en commande simple) — jamais déduit du contenu, toujours choisi par le client. */
  plat: number;
}

type ModeCommande = "simple" | "groupee" | null;

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

/** Étiquette de campagne mémorisée à l'arrivée sur le site (valable 7 jours) ; undefined si aucune ou stockage indisponible. */
function lireSourceCampagne(): string | undefined {
  try {
    const brut = localStorage.getItem(CLE_SOURCE_CAMPAGNE);
    if (!brut) return undefined;
    const { source, le } = JSON.parse(brut) as { source?: unknown; le?: unknown };
    if (typeof le !== "number" || Date.now() - le > DUREE_SOURCE_CAMPAGNE_MS) return undefined;
    return normaliserSourceCampagne(source) ?? undefined;
  } catch {
    return undefined;
  }
}

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
  const [accueilFideliteOuvert, setAccueilFideliteOuvert] = useState(false);
  const [onglet, setOnglet] = useState<Onglet | null>(null);
  const [autresBoissonsOuvert, setAutresBoissonsOuvert] = useState(false);
  const [panier, setPanier] = useState<LignePanierPublique[]>([]);
  // Commande simple ou à plusieurs : la question est posée avant le menu. En mode "plusieurs",
  // chaque personne a son plat (index dans `nomsPlats`), jamais déduit automatiquement.
  const [mode, setMode] = useState<ModeCommande>(null);
  const [platActif, setPlatActif] = useState(0);
  const [nomsPlats, setNomsPlats] = useState<string[]>([""]);
  const [messagePlat, setMessagePlat] = useState<string | null>(null);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  // Ligne du panier en cours de modification (même fenêtre, déjà remplie) — null pour un nouvel ajout.
  const [ligneEnModification, setLigneEnModification] = useState<LignePanierPublique | null>(null);
  const [ligneCorrectionBoisson, setLigneCorrectionBoisson] = useState<LignePanierPublique | null>(null);
  // Aucun canal présélectionné : le client doit cliquer explicitement (cf. ancien site, 2026-10-07).
  const [canal, setCanal] = useState<CanalPublic | null>(null);
  const [boissonOfferteSaveurs, setBoissonOfferteSaveurs] = useState<string[]>([]);
  const [canetteOfferteSaveurs, setCanetteOfferteSaveurs] = useState<string[]>([]);
  const [cadeauSauces, setCadeauSauces] = useState<string[]>([]);

  const [pretPourPersistance, setPretPourPersistance] = useState(false);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [emailDejaConnu, setEmailDejaConnu] = useState(false);
  // Profil du client (étudiant, lycéen…) : demandé une fois ; déjà connu pour ce numéro = plus redemandé.
  const [profil, setProfil] = useState<ProfilClient | null>(null);
  const [profilDejaConnu, setProfilDejaConnu] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const brut = sessionStorage.getItem(CLE_PANIER);
        if (brut) {
          const etat = JSON.parse(brut);
          if (Array.isArray(etat.panier)) setPanier(
              etat.panier.map((l: LignePanierPublique) => ({
                ...l,
                plat: l.plat ?? 0,
                viandesSupp: l.viandesSupp ?? [],
                saucesSupp: l.saucesSupp ?? [],
                oignonsFrits: l.oignonsFrits ?? false,
              }))
            );
          if (etat.mode === "simple" || etat.mode === "groupee") setMode(etat.mode);
          if (typeof etat.platActif === "number") setPlatActif(etat.platActif);
          if (Array.isArray(etat.nomsPlats) && etat.nomsPlats.length > 0) setNomsPlats(etat.nomsPlats);
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
      sessionStorage.setItem(CLE_PANIER, JSON.stringify({ panier, boissonOfferteSaveurs, mode, platActif, nomsPlats }));
    } catch {
      // Stockage plein ou indisponible : la session continue sans persistance.
    }
  }, [pretPourPersistance, panier, boissonOfferteSaveurs, mode, platActif, nomsPlats]);

  // Un email déjà enregistré pour ce numéro n'est pas redemandé (oui/non seulement, cf. /api/commande/email-connu).
  useEffect(() => {
    let annule = false;
    const telephoneComplet = normaliserTelephone(telephone);
    const minuteur = setTimeout(async () => {
      if (!telephoneComplet) {
        if (!annule) {
          setEmailDejaConnu(false);
          setProfilDejaConnu(false);
        }
        return;
      }
      try {
        const reponse = await fetch(`/api/commande/email-connu?telephone=${encodeURIComponent(telephoneComplet)}`);
        if (annule) return;
        const data = await reponse.json();
        setEmailDejaConnu(Boolean(data.emailConnu));
        setProfilDejaConnu(Boolean(data.profilConnu));
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
  const [lieuId, setLieuId] = useState("");
  // Dernier lieu de livraison connu du client reconnu : présélectionné dès qu'il choisit la livraison (modifiable en un clic).
  const [dernierLieu, setDernierLieu] = useState<{ lieuId: string; precision: string } | null>(null);
  const lieu = trouverLieu(lieuId);
  const [dateCommande, setDateCommande] = useState(() => datesOuvertes[0] ?? aujourdHui);
  const creneauxValides = useMemo(
    () => {
      const tous = creneauxPourDate(dateCommande, parametres.heureDebut, parametres.heureFin);
      return canal === "livraison" ? creneauxLivraisonPossibles(tous, dateCommande, lieu) : tous;
    },
    [dateCommande, parametres.heureDebut, parametres.heureFin, canal, lieu]
  );
  const [creneauHeure, setCreneauHeure] = useState(() => creneauxValides[0] ?? "");
  // Le client choisit lui-même : « dès que possible » ou une heure précise — jamais présélectionné.
  const [quand, setQuand] = useState<"asap" | "heure" | null>(null);
  const commandeAvance = dateCommande !== aujourdHui;
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [fideliteVerifiee, setFideliteVerifiee] = useState<{ telephone: string; email: string; tamponsDisponibles: number; montantCumule: number } | null>(
    null
  );
  const [nbTampons, setNbTampons] = useState(0);
  // Un client qui a une récompense DOIT dire s'il l'utilise ou non avant de pouvoir commander (jamais appliquée toute seule).
  const [choixRecompenseFait, setChoixRecompenseFait] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [accepteCgv, setAccepteCgv] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  // Commande groupée : plat choisi par le client pour les ajouts du bloc « Et avec ça ? » (jamais déduit).
  const [platEtAvecCa, setPlatEtAvecCa] = useState<number | null>(null);

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
      boissons: produits.filter((p) => p.categorie === "boisson"),
    };
  }, [produits]);

  const onglets = useMemo(() => {
    const liste: { cle: Onglet; titre: string }[] = [];
    if (groupes.grillades.length + groupes.accompagnements.length > 0)
      liste.push({ cle: "grillades", titre: "Grillades & acc." });
    if (groupes.tacos.length + menusSpeciaux.length > 0) liste.push({ cle: "tacos", titre: "Tacos & Menu étudiant" });
    if (groupes.barquettes.length + groupes.bowls.length > 0) liste.push({ cle: "barquettes", titre: "Barquettes & Bowls" });
    if (platsDuJour.length > 0) liste.push({ cle: "plats", titre: "Plats du jour" });
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

  // Boissons 50 cl proposables dans une formule snack (prix de la carte − 0,50 €).
  const boissons50cl = useMemo(
    () => produits.filter((p) => p.familleBoisson === "boisson_50cl" && p.prix !== null).map((p) => ({ nom: p.nom, prix: p.prix })),
    [produits]
  );

  // ---- Calculs de prix (identiques à l'ancien site) -------------------------
  const prixLigne = (l: LignePanierPublique) =>
    l.produit.prix +
    ajustementBoissonFormule(l.produit, l.sansBoisson === true, l.boissonIncluse, boissons50cl) +
    (l.saladeOption ? (l.produit.saladePrixOption ?? 0) : 0) +
    (l.produit.saladeOuBoisson && l.saladeIncluse === true && l.boissonIncluse ? MONTANT_SUPPLEMENT_SALADE_ET_BOISSON : 0) +
    // Accompagnements : 2 inclus au choix, le 3e et les suivants au prix de l'accompagnement.
    l.accompagnementsInclus.slice(2).reduce((t, nomAcc) => t + (produits.find((p) => p.nom === nomAcc)?.prix ?? 0), 0) +
    l.viandesSupp.length * (produitViandeSupplementaire?.prix ?? 0) +
    l.saucesSupp.length * (produitSauceSupplementaire?.prix ?? 0) +
    (l.oignonsFrits ? MONTANT_OIGNONS_FRITS : 0);

  const total = panier.reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const nbArticles = panier.reduce((acc, l) => acc + l.quantite, 0);
  const enGroupe = mode === "groupee";
  const platCourant = enGroupe ? platActif : 0;
  const totalDuPlat = (index: number) =>
    panier.filter((l) => l.plat === index).reduce((acc, l) => acc + prixLigne(l) * l.quantite, 0);
  const nbPlatsRemplis = nomsPlats.filter((_, i) => panier.some((l) => l.plat === i)).length;
  const totalPlatActif = totalDuPlat(platCourant);
  const resteAuPlatActif = Math.max(0, SEUIL_MINIMUM_PLAT - totalPlatActif);
  const maxTamponsUtilisables = Math.min(fideliteVerifiee?.tamponsDisponibles ?? 0, Math.floor(total / MONTANT_RECOMPENSE));
  const nbTamponsEffectif = Math.min(nbTampons, maxTamponsUtilisables);
  const choixRecompenseRequis = maxTamponsUtilisables > 0 && !choixRecompenseFait;
  const livraisonPossible = parametres.livraisonActive && parametres.zonesActives.length > 0;
  const totalApresTampons = Math.max(0, total - nbTamponsEffectif * MONTANT_RECOMPENSE);
  const minimumAtteint = totalApresTampons >= parametres.minimumCommande;
  const montantAPayer = totalApresTampons;
  // Boisson 2 L offerte : calculée sur le montant que le client PAIE RÉELLEMENT (après ses points de fidélité), comme toutes les offres.
  const palierGroupeReel = palierGroupeActif(nbArticles, montantAPayer);
  const nbBoissonsOffertes = nombreBoissonsOffertes(nbArticles, montantAPayer);
  const boissonsOffertesAChoisir =
    palierGroupeReel === "GROUPE_4"
      ? Math.max(0, nbBoissonsOffertes - boissonOfferteSaveurs.slice(0, nbBoissonsOffertes).filter(Boolean).length)
      : 0;
  // Offre du jour : 1 canette offerte par tranche de 10 € PAYÉS (après points de fidélité), commandes servies le jour de l'offre.
  const nbCanettesOffertes = nombreCanettesOffertes(montantAPayer, dateCommande);
  // Offre du jour : 3 ailes + frites + 2 sauces offertes dès 20 € payés (commandes servies le jour de l'offre).
  const offreCadeauJour = offreCadeauActive(dateCommande);
  const offreCanetteJour = offreCanetteActive(dateCommande);
  const nbBox = nombreBoxOffertes(montantAPayer, dateCommande);
  const cadeauAcquis = nbBox > 0;
  const resteAvantCadeau = SEUIL_OFFRE_CADEAU - (montantAPayer % SEUIL_OFFRE_CADEAU);
  const nbSaucesCadeau = nbBox * NB_SAUCES_CADEAU;
  const saucesCadeauAChoisir = cadeauAcquis
    ? Math.max(0, nbSaucesCadeau - Array.from({ length: nbSaucesCadeau }, (_, i) => cadeauSauces[i]).filter(Boolean).length)
    : 0;
  const canettesOffertesAChoisir = Math.max(0, nbCanettesOffertes - canetteOfferteSaveurs.slice(0, nbCanettesOffertes).filter(Boolean).length);
  // Boisson 2 L offerte tous les 40 € (à toute heure) : progression vers la prochaine tranche.
  const resteAvantProchaineBoisson = SEUIL_GROUPE_4_MONTANT - (montantAPayer % SEUIL_GROUPE_4_MONTANT);
  // Points de fidélité (10 € payés = 1 point), en tenant compte de ce que le client a déjà cumulé s'il est reconnu.
  const reliquatFidelite = fideliteVerifiee?.montantCumule ?? 0;
  const pointsGagnesPour = (montant: number) =>
    Math.floor((reliquatFidelite + montant) / MONTANT_RECOMPENSE) - Math.floor(reliquatFidelite / MONTANT_RECOMPENSE);
  const resteProchainPoint = MONTANT_RECOMPENSE - ((reliquatFidelite + montantAPayer) % MONTANT_RECOMPENSE);
  const pointsProchainPoint = pointsGagnesPour(montantAPayer) + 1;
  // On pousse toujours vers l'objectif le plus proche : prochain point de fidélité ou prochaine boisson 2 L offerte.
  const platEtAvecCaValide = enGroupe ? (platEtAvecCa !== null && platEtAvecCa < nomsPlats.length ? platEtAvecCa : null) : platCourant;
  const etAvecCaBloque = enGroupe && platEtAvecCaValide === null;
  const viseBoisson2L = resteAvantProchaineBoisson < resteProchainPoint;
  const pointsAuProchainPalier = pointsGagnesPour(montantAPayer + resteAvantProchaineBoisson);
  const pourcentageProchaineBoisson = viseBoisson2L
    ? Math.round(((montantAPayer % SEUIL_GROUPE_4_MONTANT) / SEUIL_GROUPE_4_MONTANT) * 100)
    : Math.round((((reliquatFidelite + montantAPayer) % MONTANT_RECOMPENSE) / MONTANT_RECOMPENSE) * 100);

  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function declencherPulse() {
    setPulse(true);
    if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    pulseTimeout.current = setTimeout(() => setPulse(false), 250);
  }

  function changerDate(nouvelleDate: string) {
    setDateCommande(nouvelleDate);
    const tousCreneaux = creneauxPourDate(nouvelleDate, parametres.heureDebut, parametres.heureFin);
    const creneaux = canal === "livraison" ? creneauxLivraisonPossibles(tousCreneaux, nouvelleDate, lieu) : tousCreneaux;
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
    saladeOption: boolean = false,
    viandesSupp: string[] = [],
    saucesSupp: string[] = [],
    platForce?: number,
    oignonsFrits: boolean = false,
    viaSuggestion: boolean = false
  ) {
    declencherPulse();
    const platCible = platForce ?? platCourant;
    const memeTri = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const cle = (l: LignePanierPublique) =>
      l.produit.id === produit.id &&
      l.plat === platCible &&
      memeTri(l.viandes, viandesChoisies) &&
      memeTri(l.sauces, saucesChoisies) &&
      memeTri(l.saveurs, saveursChoisies) &&
      l.boissonIncluse === boissonIncluse &&
      l.sansBoisson === sansBoisson &&
      l.sansSauce === sansSauce &&
      l.saladeOption === saladeOption &&
      l.saladeIncluse === saladeIncluse &&
      memeTri(l.viandesSupp, viandesSupp) &&
      memeTri(l.saucesSupp, saucesSupp) &&
      l.oignonsFrits === oignonsFrits &&
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
        return precedent.map((l) => {
          if (l !== existante) return l;
          const nouvelleQuantite = plafonnerQuantite(l.produit, l.id, l.quantite + quantite);
          return {
            ...l,
            quantite: nouvelleQuantite,
            quantiteSuggeree: viaSuggestion ? (l.quantiteSuggeree ?? 0) + (nouvelleQuantite - l.quantite) : l.quantiteSuggeree,
          };
        });
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
          viandesSupp,
          saucesSupp,
          oignonsFrits,
          quantiteSuggeree: viaSuggestion ? quantiteAjoutee : undefined,
          plat: platCible,
        },
      ];
    });
    setMessagePlat(null);
  }

  function surClicProduit(produit: ProduitPublic) {
    // Une seule fenêtre pour tous les produits (plat du jour, menu, snack…) : mêmes étapes, même bouton « Ajouter · prix ».
    setProduitEnSelection(produit);
  }

  function modifierQuantite(id: string, delta: number) {
    setPanier((precedent) =>
      precedent
        .map((l) => {
          if (l.id !== id) return l;
          const quantite = plafonnerQuantite(l.produit, l.id, l.quantite + delta);
          return { ...l, quantite, quantiteSuggeree: l.quantiteSuggeree ? Math.min(l.quantiteSuggeree, quantite) : undefined };
        })
        .filter((l) => l.quantite > 0)
    );
  }

  function ligneAuPanierDirect(produitId: string, saveur: string | null) {
    // Uniquement les lignes du plat en cours : les + / − ne touchent jamais le plat d'une autre personne.
    return panier.find((l) => l.produit.id === produitId && l.plat === platCourant && (l.saveurs[0] ?? null) === saveur);
  }

  function quantiteProduit(produitId: string) {
    return panier.filter((l) => l.produit.id === produitId && l.plat === platCourant).reduce((somme, l) => somme + l.quantite, 0);
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

  function choisirMode(nouveau: "simple" | "groupee") {
    setMode(nouveau);
    setPlatActif(0);
    setNomsPlats([""]);
    setMessagePlat(null);
    suivreEvenement("mode_choisi");
  }

  function changerMode() {
    if (nbArticles > 0 && !window.confirm("Changer de mode videra le panier en cours. Continuer ?")) return;
    setPanier([]);
    setMode(null);
    setPlatActif(0);
    setNomsPlats([""]);
    setMessagePlat(null);
  }

  /** « Plat suivant » : passe à la personne suivante (en crée une si besoin) — bloqué tant que le plat actuel n'atteint pas le minimum. */
  function platSuivant() {
    if (resteAuPlatActif > 0) return;
    const suivant = platActif + 1;
    setNomsPlats((n) => (suivant < n.length ? n : [...n, ""]));
    setPlatActif(suivant);
    setMessagePlat(`Plat ${suivant + 1} : que prend la personne suivante ?`);
    setOnglet(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ajouterUnPlat() {
    const vide = nomsPlats.findIndex((_, i) => !panier.some((l) => l.plat === i));
    const cible = vide !== -1 ? vide : nomsPlats.length;
    if (vide === -1) setNomsPlats((n) => [...n, ""]);
    setPlatActif(cible);
    setMessagePlat(`Plat ${cible + 1} : que prend la personne suivante ?`);
    aller("menu");
  }

  function modifierPlat(index: number) {
    setPlatActif(index);
    setMessagePlat(null);
    aller("menu");
  }

  function supprimerPlat(index: number) {
    if (nomsPlats.length <= 1) return;
    setPanier((p) => p.filter((l) => l.plat !== index).map((l) => (l.plat > index ? { ...l, plat: l.plat - 1 } : l)));
    setNomsPlats((n) => n.filter((_, i) => i !== index));
    setPlatActif((a) => Math.max(0, a > index ? a - 1 : a === index ? Math.max(0, index - 1) : a));
  }

  /** Changer de lieu : les créneaux changent, on garde l'heure choisie si le nouveau lieu la propose encore. */
  function changerLieu(nouveauId: string) {
    setLieuId(nouveauId);
    const nouveauLieu = trouverLieu(nouveauId);
    const possibles = creneauxLivraisonPossibles(
      creneauxPourDate(dateCommande, parametres.heureDebut, parametres.heureFin),
      dateCommande,
      nouveauLieu
    );
    if (!possibles.includes(creneauHeure) || quand === "asap") setCreneauHeure(possibles[0] ?? "");
  }

  /** « Dès que possible » : premier créneau de la première date ouverte. */
  function choisirAuPlusTot() {
    // Première date ouverte qui a encore un créneau possible (lieu à créneaux fixes : il peut n'en rester aucun aujourd'hui).
    let date = datesOuvertes[0] ?? aujourdHui;
    let possibles: string[] = [];
    for (const d of datesOuvertes.length > 0 ? datesOuvertes : [aujourdHui]) {
      const tous = creneauxPourDate(d, parametres.heureDebut, parametres.heureFin);
      // Livraison : seule la restriction exceptionnelle éventuelle s'applique (plus de délai minimum).
      possibles = canal === "livraison" ? creneauxLivraisonPossibles(tous, d, lieu) : tous;
      date = d;
      if (possibles.length > 0) break;
    }
    setDateCommande(date);
    setCreneauHeure(possibles[0] ?? "");
    if (date !== aujourdHui) setModePaiement("stripe");
    setQuand("asap");
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
    if (choixRecompenseRequis) {
      setErreur("Choisis d'abord si tu utilises ta récompense (oui ou non).");
      aller("panier");
      return;
    }
    if (!profilDejaConnu && !profil) {
      setErreur("Choisis ce qui te correspond le mieux (une seule fois) : ça nous permet de t'envoyer des offres adaptées.");
      return;
    }
    if (saucesCadeauAChoisir > 0) {
      setErreur(`Choisis les sauces de ${nbBox > 1 ? "tes box offertes" : "ta box offerte"} (3 ailes grillées + frites) avant de valider.`);
      return;
    }
    if (canettesOffertesAChoisir > 0) {
      setErreur(`Choisis le parfum de ta canette offerte${nbCanettesOffertes > 1 ? "s" : ""} avant de valider.`);
      return;
    }
    if (enGroupe) {
      const indexPlatsRemplis = nomsPlats.map((_, i) => i).filter((i) => panier.some((l) => l.plat === i));
      if (indexPlatsRemplis.length < 2) {
        setErreur("Une commande à plusieurs doit contenir au moins 2 plats. Ajoute un plat, ou repasse en « Juste moi ».");
        return;
      }
      const trop = indexPlatsRemplis.find((i) => totalDuPlat(i) < SEUIL_MINIMUM_PLAT);
      if (trop !== undefined) {
        setErreur(`Plat ${trop + 1} : il doit atteindre au moins ${SEUIL_MINIMUM_PLAT} € — ajoute un accompagnement ou une boisson.`);
        return;
      }
    }
    if (!canal) {
      setErreur("Choisis comment récupérer ta commande : sur place, à emporter ou en livraison.");
      return;
    }
    if (quand === null) {
      setErreur("Choisis « Dès que possible » ou une heure précise.");
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
      if (!lieu) {
        setErreur("Choisis le lieu de livraison.");
        return;
      }
      if (lieu.village && !adresse.trim()) {
        setErreur("Précise l'endroit de livraison (mairie, CCAS, rue…).");
        return;
      }
      if (lieu.creneaux && !creneauxValides.includes(creneauHeure)) {
        setErreur("Choisis un des créneaux proposés pour ce lieu.");
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
        viandesSupplementaires: l.viandesSupp,
        saucesSupplementaires: l.saucesSupp,
        oignonsFrits: l.oignonsFrits || undefined,
        quantiteSuggeree: l.quantiteSuggeree || undefined,
        platIndex: enGroupe ? l.plat : null,
        pourQui: enGroupe ? nomsPlats[l.plat]?.trim() || null : null,
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
          lieuId: canal === "livraison" ? lieuId : undefined,
          precision: canal === "livraison" ? adresse.trim() : undefined,
          zone: canal === "livraison" ? zone : undefined,
          consentementCgv: accepteCgv,
          lignes,
          fideliteTelephone: nbTamponsEffectif > 0 ? fideliteVerifiee?.telephone : undefined,
          fideliteEmail: nbTamponsEffectif > 0 ? fideliteVerifiee?.email : undefined,
          nbTampons: nbTamponsEffectif,
          boissonOfferteSaveurs: palierGroupeReel === "GROUPE_4" ? boissonOfferteSaveurs.slice(0, nbBoissonsOffertes) : undefined,
          canetteOfferteSaveurs: nbCanettesOffertes > 0 ? canetteOfferteSaveurs.slice(0, nbCanettesOffertes) : undefined,
          profil: !profilDejaConnu && profil ? profil : undefined,
          cadeauSauces: cadeauAcquis ? cadeauSauces.slice(0, nbSaucesCadeau) : undefined,
          sourceCampagne: lireSourceCampagne(),
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
        window.location.assign(dataPaiement.url);
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
            <span className="text-lg font-bold leading-tight text-gray-900">{produit.nom}</span>
            {etiquette && (
              <span className="rounded-full bg-[#2D5A27] px-2 py-0.5 text-xs font-bold text-white">{etiquette}</span>
            )}
            {q > 0 && <span className="rounded-full bg-[#8B2020] px-2 py-0.5 text-xs font-bold text-white">×{q}</span>}
          </span>
          {produit.description && <span className="mt-0.5 block text-sm leading-snug text-gray-800">{produit.description}</span>}
          {epuise ? (
            <span className="mt-0.5 block text-sm font-bold text-red-700">Épuisé aujourd&apos;hui</span>
          ) : (
            <span className="mt-0.5 block whitespace-nowrap text-xl font-extrabold" style={{ color: ROUGE }}>
              {euros(produit.prix)}
            </span>
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
    const nomAffiche = saveur ?? produit.nom;
    return (
      <div key={saveur ? `${produit.id}::${saveur}` : produit.id} className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight text-gray-900">{nomAffiche}</p>
          {(q === 0 || epuise) && (
            <p className={`whitespace-nowrap text-xl font-extrabold ${epuise ? "text-red-700" : ""}`} style={epuise ? undefined : { color: ROUGE }}>
              {epuise ? "Épuisé aujourd'hui" : euros(produit.prix)}
            </p>
          )}
        </div>
        {q > 0 && ligne ? (
          <>
            <span className="whitespace-nowrap text-xl font-extrabold" style={{ color: ROUGE }}>
              {euros(produit.prix * q)}
            </span>
            <Stepper
              quantite={q * pieces}
              onMoins={() => modifierQuantite(ligne.id, -1)}
              onPlus={() => ajouterAuPanier(produit, [], [], saveur ? [saveur] : [])}
              label={nomAffiche}
            />
          </>
        ) : (
          <BoutonPlus
            onClick={() => ajouterAuPanier(produit, [], [], saveur ? [saveur] : [])}
            label={`Ajouter ${nomAffiche}`}
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
            ? (produit.nom === NOM_PRODUIT_BOISSON_OFFERTE ? parfums2l : saveurs).map((s) => ligneDirecte(produit, s.nom))
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
        liste: groupes.boissons.filter((p) => p.familleBoisson === f.valeur && p.id !== produitCanetteRapide?.id),
      })),
      { cle: "autres", titre: "Autres boissons", liste: groupes.boissons.filter((p) => !p.familleBoisson && p.id !== produitCanetteRapide?.id) },
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
          <p className="text-lg font-bold leading-tight text-gray-900">{l.produit.nom}</p>
          <p className="whitespace-nowrap text-lg font-extrabold" style={{ color: ROUGE }}>
            {euros(prixLigne(l) * l.quantite)}
          </p>
        </div>
        <div className="mt-1 space-y-0.5 text-sm text-gray-800">
          {l.viandes.length > 0 && <p>{l.viandes.join(", ")}</p>}
          {l.saveurs.length > 0 && <p>{l.saveurs.join(", ")}</p>}
          {l.sauces.length > 0 && <p>Sauces : {l.sauces.join(", ")}</p>}
          {l.sansSauce && <p className="font-semibold">Sans sauce</p>}
          {l.saladeOption && <p>+ Salade (+{euros(l.produit.saladePrixOption ?? 0)})</p>}
          {l.viandesSupp.length > 0 && (
            <p className="font-semibold">
              + Viande en plus : {l.viandesSupp.join(", ")} (+{euros(l.viandesSupp.length * (produitViandeSupplementaire?.prix ?? 0))})
            </p>
          )}
          {l.saucesSupp.length > 0 && (
            <p className="font-semibold">
              + Sauce en plus : {l.saucesSupp.join(", ")} (+{euros(l.saucesSupp.length * (produitSauceSupplementaire?.prix ?? 0))})
            </p>
          )}
          {l.oignonsFrits && <p className="font-semibold">+ Oignons frits (+{euros(MONTANT_OIGNONS_FRITS)})</p>}
          {l.accompagnementsInclus.length > 0 && (
            <p>Accompagnement : {l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}</p>
          )}
          {l.saladeIncluse !== null && <p>{l.saladeIncluse ? "Avec salade" : "Sans salade"}</p>}
          {l.boissonIncluse && (
            <p>
              Boisson incluse : {l.boissonIncluse}
              {l.produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && l.produit.canetteIncluse && (
                <button type="button" onClick={() => retirerBoisson(l.id)} className="ml-2 font-semibold text-orange-700 underline">
                  Retirer (−{euros(supplementBoissonFormule(l.boissonIncluse, boissons50cl))})
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
          <div className="flex items-center gap-4">
            {["snacking", "menu_special", "plat_du_jour"].includes(l.produit.categorie) && (
              <button
                type="button"
                onClick={() => {
                  setLigneEnModification(l);
                  setProduitEnSelection(l.produit);
                }}
                className="text-sm font-extrabold underline"
                style={{ color: ROUGE }}
              >
                Modifier
              </button>
            )}
            <button type="button" onClick={() => setPanier((p) => p.filter((x) => x.id !== l.id))} className="text-sm font-semibold text-gray-800 underline">
              Supprimer
            </button>
          </div>
        </div>
      </li>
    );
  }

  // Choix des sauces de la box offerte : affiché dès le panier (juste sous le message « Bravo ») et rappelé à la validation.
  const blocChoixSauces = cadeauAcquis ? (
      <section
        id="cadeau-offert"
        className={`rounded-xl border-2 p-4 ${saucesCadeauAChoisir > 0 ? "border-red-700 bg-red-50" : "border-[#2D5A27] bg-green-50"}`}
      >
        <p className="text-base font-extrabold text-gray-900">
          🎁 {nbBox > 1 ? `Tes ${nbBox} box OFFERTES` : "Ta box OFFERTE"} : 3 ailes grillées + frites
        </p>
        <p className="mt-0.5 text-sm font-semibold text-gray-800">Choisis {NB_SAUCES_CADEAU} sauces pour {nbBox > 1 ? "chaque box" : "ta box"}</p>
        {Array.from({ length: nbSaucesCadeau }, (_, index) => (
          <div key={index} className="mt-2">
            <p className="text-sm font-semibold text-gray-900">
              {nbBox > 1 ? `Box n°${Math.floor(index / NB_SAUCES_CADEAU) + 1} · ` : ""}Sauce n°{(index % NB_SAUCES_CADEAU) + 1}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {sauces.map((sa) => (
                <button
                  key={sa.id}
                  type="button"
                  onClick={() =>
                    setCadeauSauces((prev) =>
                      Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) => (i === index ? sa.nom : prev[i]))
                    )
                  }
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                    cadeauSauces[index] === sa.nom ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                  }`}
                >
                  {sa.nom}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
  ) : null;

  // Choix du parfum de la canette offerte : affiché dès le panier et rappelé à la validation.
  const blocChoixCanette = nbCanettesOffertes > 0 ? (
      <section
        id="canette-offerte"
        className={`rounded-xl border-2 p-4 ${canettesOffertesAChoisir > 0 ? "border-red-700 bg-red-50" : "border-[#2D5A27] bg-green-50"}`}
      >
        <p className="text-base font-extrabold text-gray-900">
          🎁 Offre du jour : choisis {nbCanettesOffertes > 1 ? `tes ${nbCanettesOffertes} canettes OFFERTES` : "ta canette OFFERTE"}
        </p>
        {Array.from({ length: nbCanettesOffertes }, (_, index) => (
          <div key={index} className="mt-2">
            {nbCanettesOffertes > 1 && <p className="text-sm font-semibold text-gray-900">Canette offerte n°{index + 1}</p>}
            <div className="mt-1 flex flex-wrap gap-2">
              {saveurs.map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() =>
                    setCanetteOfferteSaveurs((prev) =>
                      Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) => (i === index ? sv.nom : prev[i]))
                    )
                  }
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                    canetteOfferteSaveurs[index] === sv.nom ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                  }`}
                >
                  {sv.nom}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
  ) : null;

  // « Et avec ça ? » : frites, ailes de poulet, brochettes de bœuf, croupion et salade (la canette est dans le même bloc), ils restent affichés (avec la quantité) pour pouvoir en ajouter d'autres.
  const SUGGESTIONS_ET_AVEC_CA = ["Frites", "Ailes de poulet", "Brochettes bœuf", "Croupion", "Salade"];
  const accompagnementsSuggeres = SUGGESTIONS_ET_AVEC_CA.map((debut) =>
    produits.find((p) => p.nom.startsWith(debut) && p.nbSaveursMax === 0 && p.nbViandesMax === 0)
  ).filter((p): p is ProduitPublic => !!p);
  const messageTotalApayer =
    nbTamponsEffectif > 0
      ? `${nbTamponsEffectif * NB_TAMPONS_RECOMPENSE} points de fidélité : −${euros(nbTamponsEffectif * MONTANT_RECOMPENSE)}`
      : null;

  // Reconnaissance du client (points de fidélité) : mêmes propriétés pour la carte de l'accueil et celle du formulaire.
  const proprietesCarteFidelite: ComponentProps<typeof CarteFidelite> = {
    telephoneExterne: telephone,
    emailExterne: email,
    montantPanier: total,
    nbTampons: nbTamponsEffectif,
    onChangeNbTampons: setNbTampons,
    onSoldeVerifie: (verifie, tel, mail, tamponsDisponibles, montantCumule) =>
      setFideliteVerifiee(
        verifie && tel && mail ? { telephone: tel, email: mail, tamponsDisponibles: tamponsDisponibles ?? 0, montantCumule: montantCumule ?? 0 } : null
      ),
    onOublierIdentite: () => {
      setTelephone("");
      setEmail("");
      try {
        localStorage.removeItem(CLE_IDENTITE);
      } catch {
        // rien à faire
      }
    },
    onPrefillIdentite: (infos) => {
      setTelephone((precedent) => precedent.trim() || infos.telephone);
      setEmail((precedent) => precedent.trim() || infos.email);
      if (infos.nom) setNom((precedent) => precedent.trim() || infos.nom!);
      if (infos.prenom) setPrenom((precedent) => precedent.trim() || infos.prenom!);
      if (canal === "livraison") {
        if (infos.zone) setZone((precedent) => precedent.trim() || infos.zone!);
      }
      const dernier = lieuPrincipalDeAdresse(infos.adresse);
      if (dernier) {
        const precision = dernier.village && infos.adresse?.includes(" — ") ? infos.adresse.split(" — ").slice(1).join(" — ").trim() : "";
        setDernierLieu({ lieuId: dernier.id, precision });
        if (canal === "livraison" && !lieuId) {
          changerLieu(dernier.id);
          if (precision) setAdresse(precision);
        }
      }
    },
  };

  const libelleQuand = commandeAvance
    ? `Le ${new Date(`${dateCommande}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`
    : "Aujourd'hui";

  return (
    <div className={`min-h-screen ${enGroupe ? "pb-48" : "pb-28"}`} style={{ backgroundColor: FOND_PAGE }}>
      {/* Promos toujours bien visibles : fidélité, boisson 2 L offerte dès 40 €, offre du jour. */}
      <div className="px-4 py-2 text-center text-sm font-extrabold text-white" style={{ backgroundColor: VERT }}>
        🎁 10 € dépensés = 1 point de fidélité · 10 points de fidélité = 10 € offerts
      </div>
      <div className="px-4 py-2 text-center text-sm font-extrabold text-white" style={{ backgroundColor: "#C2540C" }}>
        🥤 Dès 40 € payés : 1 boisson 2 L OFFERTE (80 € = 2 boissons…)
      </div>
      {pointsDoublesPossibles(aujourdHui) && (
        <div className="px-4 py-2 text-center text-sm font-extrabold text-white" style={{ backgroundColor: "#1F3A5F" }}>
          🎁 Aujourd&apos;hui seulement, sur 3sauces.fr : points de fidélité DOUBLÉS pour tous nos clients
        </div>
      )}
      {offreCadeauActive(aujourdHui) && (
        <div className="px-4 py-2 text-center text-sm font-extrabold text-white" style={{ backgroundColor: "#1F3A5F" }}>
          🎁 Aujourd&apos;hui seulement, sur 3sauces.fr : une BOX OFFERTE (3 ailes grillées + frites + 2 sauces au choix) par tranche de {SEUIL_OFFRE_CADEAU} € d&apos;achats
        </div>
      )}
      {offreCanetteActive(aujourdHui) && (
        <div className="px-4 py-2 text-center text-sm font-extrabold text-white" style={{ backgroundColor: "#1F3A5F" }}>
          🎁 Jusqu&apos;au 12 décembre, sur 3sauces.fr : 1 CANETTE OFFERTE par tranche de 10 € payés
        </div>
      )}

      {vue === "menu" && (
        <div className="mx-auto max-w-lg px-4 pt-3">
          <div className="rounded-lg border-2 border-[#2D5A27] bg-[#FFF8F0]">
            {/* Une seule ligne tant que le client ne l'ouvre pas : le menu reste visible sans défiler. */}
            <button
              type="button"
              onClick={() => setAccueilFideliteOuvert((v) => !v)}
              aria-expanded={accueilFideliteOuvert}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            >
              <span className="text-sm font-extrabold text-gray-900">
                {fideliteVerifiee
                  ? (() => {
                      const points = progressionTampons(fideliteVerifiee.montantCumule, fideliteVerifiee.tamponsDisponibles);
                      if (points === 0) return "🎁 Ton compte fidélité · voir mes points de fidélité";
                      return `🎁 Tu as ${points} point${points > 1 ? "s" : ""} de fidélité${
                        fideliteVerifiee.tamponsDisponibles > 0 ? ` · ${fideliteVerifiee.tamponsDisponibles * MONTANT_RECOMPENSE} € de récompense` : ""
                      }`;
                    })()
                  : "🎁 Déjà client chez 3 Sauces ? Vois tes points de fidélité"}
              </span>
              <span aria-hidden="true" className="text-gray-700">
                {accueilFideliteOuvert ? "▲" : "▼"}
              </span>
            </button>
            {/* Toujours monté (même replié) : la reconnaissance du client et ses points se calculent dès l'arrivée. */}
            <div className={accueilFideliteOuvert ? "space-y-2 px-3 pb-3" : "hidden"}>
              <p className="text-sm font-semibold text-gray-900">Renseigne ton numéro de téléphone et ton e-mail pour voir tes points de fidélité.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  id="accueil-telephone"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  inputMode="tel"
                  placeholder="Téléphone (0639123456)"
                  aria-label="Ton numéro de téléphone"
                  className="rounded border border-gray-300 bg-white p-2 text-base text-gray-900"
                />
                <input
                  id="accueil-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="E-mail"
                  aria-label="Ton e-mail"
                  className="rounded border border-gray-300 bg-white p-2 text-base text-gray-900"
                />
              </div>
              <CarteFidelite {...proprietesCarteFidelite} integre />
            </div>
          </div>
        </div>
      )}

      {vue === "menu" && mode === null && (
        <div className="mx-auto max-w-lg space-y-4 p-4">
          <h2 className="pt-2 text-2xl font-extrabold text-gray-900">Tu commandes pour combien de personnes ?</h2>
          <button
            type="button"
            onClick={() => choisirMode("simple")}
            className="w-full rounded-xl p-5 text-left text-white shadow-md active:scale-[0.99]"
            style={{ backgroundColor: VERT }}
          >
            <span className="block text-2xl font-extrabold">Juste moi</span>
          </button>
          <button
            type="button"
            onClick={() => choisirMode("groupee")}
            className="w-full rounded-xl p-5 text-left text-white shadow-md active:scale-[0.99]"
            style={{ backgroundColor: ROUGE }}
          >
            <span className="block text-2xl font-extrabold">Plusieurs personnes</span>
          </button>
        </div>
      )}

      {vue === "menu" && mode !== null && (
        <>
          <div className="sticky top-0 z-30">
          {enGroupe && (
            <div className="border-b-2 border-[#8B2020] bg-white shadow-sm">
              <div className="mx-auto max-w-lg space-y-2 px-4 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-extrabold" style={{ color: ROUGE }}>
                    Tu remplis le plat {platActif + 1}
                  </p>
                  <p className="whitespace-nowrap text-base font-extrabold text-gray-900">{euros(totalPlatActif)}</p>
                </div>
                <input
                  value={nomsPlats[platActif] ?? ""}
                  onChange={(e) => setNomsPlats((n) => n.map((v, i) => (i === platActif ? e.target.value : v)))}
                  placeholder="Pour qui ? (prénom, facultatif)"
                  className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-base text-gray-900"
                />
                <div className="flex gap-2 overflow-x-auto">
                  {nomsPlats.map((nomPlat, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPlatActif(i)}
                      className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1 text-sm font-bold ${
                        i === platActif ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                      }`}
                    >
                      Plat {i + 1}
                      {nomPlat.trim() ? ` · ${nomPlat.trim()}` : ""} · {euros(totalDuPlat(i))}
                    </button>
                  ))}
                </div>
                {messagePlat && <p className="rounded-lg bg-[#2D5A27] px-3 py-2 text-sm font-extrabold text-white">{messagePlat}</p>}
              </div>
            </div>
          )}
          <div className="border-b border-gray-300 bg-[#F5F0E8]/95 backdrop-blur">
            {/* Tous les onglets visibles d'un coup, à largeur égale (le titre passe sur 2 lignes si besoin) : plus de défilement caché sur téléphone. */}
            <div className="mx-auto grid max-w-lg gap-1.5 px-3 py-2" style={{ gridTemplateColumns: `repeat(${Math.max(onglets.length, 1)}, minmax(0, 1fr))` }}>
              {onglets.map((o) => (
                <button
                  key={o.cle}
                  type="button"
                  onClick={() => {
                    setOnglet(o.cle);
                    setAutresBoissonsOuvert(false);
                  }}
                  className={`flex min-h-[3rem] items-center justify-center rounded-xl border-2 px-1 py-1.5 text-center text-[13px] font-extrabold leading-tight sm:text-sm ${
                    ongletActif === o.cle ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                  }`}
                >
                  {o.titre}
                </button>
              ))}
            </div>
          </div>
          </div>
          <div className="mx-auto max-w-lg space-y-4 p-4">
            <button type="button" onClick={changerMode} className="text-base font-bold text-gray-900 underline">
              ← Changer de mode ({enGroupe ? "plusieurs personnes" : "juste moi"})
            </button>
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
          {enGroupe ? (
            <div className="space-y-4">
              {nomsPlats.map((nomPlat, i) => {
                const lignesPlat = panier.filter((l) => l.plat === i);
                if (lignesPlat.length === 0) return null;
                const sous = totalDuPlat(i);
                return (
                  <div key={i} className="space-y-2 rounded-xl border-2 border-[#8B2020] bg-white/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-extrabold text-gray-900">
                        Plat {i + 1}
                        {nomPlat.trim() ? ` · ${nomPlat.trim()}` : ""}
                      </p>
                      <p className="whitespace-nowrap text-base font-extrabold" style={{ color: ROUGE }}>
                        {euros(sous)}
                      </p>
                    </div>
                    {sous < SEUIL_MINIMUM_PLAT && (
                      <p className="text-sm font-bold text-red-800">Encore {euros(SEUIL_MINIMUM_PLAT - sous)} pour valider ce plat.</p>
                    )}
                    <ul className="space-y-2">{lignesPlat.map(lignePanier)}</ul>
                    <div className="flex gap-4">
                      <button type="button" onClick={() => modifierPlat(i)} className="text-sm font-bold text-gray-900 underline">
                        Modifier ce plat
                      </button>
                      {nomsPlats.length > 1 && (
                        <button type="button" onClick={() => supprimerPlat(i)} className="text-sm font-bold text-red-800 underline">
                          Supprimer ce plat
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={ajouterUnPlat}
                className="w-full rounded-xl py-3 text-base font-extrabold text-white"
                style={{ backgroundColor: VERT }}
              >
                + Ajouter un plat (une autre personne)
              </button>
              {nbPlatsRemplis < 2 && nbArticles > 0 && (
                <p className="rounded-lg bg-amber-100 p-3 text-sm font-bold text-amber-950">
                  Une commande à plusieurs doit avoir au moins 2 plats : ajoute un plat, ou{" "}
                  <button type="button" onClick={changerMode} className="underline">
                    repasse en « Juste moi »
                  </button>
                  .
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-3">{panier.map(lignePanier)}</ul>
          )}

          {blocChoixSauces}
          {blocChoixCanette}

          {nbArticles > 0 && (accompagnementsSuggeres.length > 0 || (produitCanetteRapide && saveurs.length > 0)) && (
            <div className="rounded-xl border-4 border-[#8B2020] bg-[#FFF1E0] p-4" id="et-avec-ca">
              <p className="text-2xl font-extrabold leading-tight" style={{ color: ROUGE }}>
                Et avec ça ?
              </p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">
                Ajoute-le en un clic
                {!viseBoisson2L ? ` · il te manque ${euros(resteProchainPoint)} pour ton prochain point de fidélité` : ""}
              </p>
              {enGroupe && (
                <div className="mt-3 rounded-lg border-2 border-[#1E3A8A] bg-white p-3">
                  <p className="text-sm font-extrabold uppercase tracking-wide text-[#1E3A8A]">① Pour quel plat ?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {nomsPlats.map((nom, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPlatEtAvecCa(i)}
                        className={`rounded-lg border-2 px-3 py-3 text-base font-extrabold ${
                          platEtAvecCaValide === i
                            ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                            : "border-dashed border-[#1E3A8A] bg-[#EEF2FF] text-[#1E3A8A]"
                        }`}
                      >
                        <span className="block">
                          {platEtAvecCaValide === i ? "✓ " : ""}
                          {nom.trim() ? nom : `Plat ${i + 1}`}
                        </span>
                        <span className="block text-lg">{euros(totalDuPlat(i))}</span>
                      </button>
                    ))}
                  </div>
                  {etAvecCaBloque && <p className="mt-2 text-sm font-bold text-amber-900">Choisis d&apos;abord le plat concerné.</p>}
                </div>
              )}
              {enGroupe && (
                <p className="mt-4 text-sm font-extrabold uppercase tracking-wide" style={{ color: ROUGE }}>
                  ② Que veux-tu ajouter{platEtAvecCaValide !== null ? ` à ${nomsPlats[platEtAvecCaValide]?.trim() || `Plat ${platEtAvecCaValide + 1}`}` : ""} ?
                </p>
              )}
              {enGroupe && platEtAvecCaValide !== null && (
                <p className="sticky top-2 z-30 mt-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-center text-base font-extrabold text-white shadow-lg">
                  {nomsPlats[platEtAvecCaValide]?.trim() || `Plat ${platEtAvecCaValide + 1}`} : {euros(totalDuPlat(platEtAvecCaValide))} en ce moment
                </p>
              )}
              {accompagnementsSuggeres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {accompagnementsSuggeres.map((p) => {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => ajouterAuPanier(p, [], [], [], null, 1, null, [], false, false, false, [], [], platEtAvecCaValide ?? undefined, false, true)}
                        disabled={etAvecCaBloque}
                        className="rounded-full disabled:opacity-40 border-2 border-[#8B2020] bg-white px-4 py-2 text-base font-extrabold text-gray-900 active:scale-95"
                      >
                        {p.nom} + {euros(p.prix)}
                        {!viseBoisson2L && p.prix >= resteProchainPoint ? " · +1 point de fidélité" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {produitCanetteRapide && saveurs.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-extrabold text-gray-900">
                    Une canette ? + {euros(produitCanetteRapide.prix)}
                    {!viseBoisson2L && produitCanetteRapide.prix >= resteProchainPoint ? " · +1 point de fidélité" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {saveurs.map((s) => {
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => ajouterAuPanier(produitCanetteRapide, [], [], [s.nom], null, 1, null, [], false, false, false, [], [], platEtAvecCaValide ?? undefined, false, true)}
                          disabled={etAvecCaBloque}
                          className="rounded-full disabled:opacity-40 border-2 border-[#8B2020] bg-white px-4 py-2 text-sm font-bold text-gray-900 active:scale-95"
                        >
                          {s.nom}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="rounded-lg bg-white p-4 text-gray-900">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-extrabold">{euros(total)}</span>
            </div>
            {messageTotalApayer && (
              <p className="mt-1 text-sm font-bold text-[#2D5A27]">
                {messageTotalApayer} · Total à payer : {euros(montantAPayer)}
              </p>
            )}
          </div>

          {/* Récompense : juste sous le total. Réponse OBLIGATOIRE (oui ou non) avant de pouvoir commander. */}
          {nbArticles > 0 && fideliteVerifiee && fideliteVerifiee.tamponsDisponibles > 0 && (
            <div id="choix-recompense" className={`rounded-xl border-4 p-3 ${choixRecompenseRequis ? "border-[#8B2020] bg-[#FFF8F0]" : "border-[#2D5A27] bg-green-50"}`}>
              <p className="text-lg font-extrabold text-gray-900">
                🎁 Tu as {fideliteVerifiee.tamponsDisponibles * MONTANT_RECOMPENSE} € de récompense
              </p>
              {maxTamponsUtilisables === 0 ? (
                <p className="mt-1 text-sm font-bold text-gray-900">
                  Ajoute encore {euros(MONTANT_RECOMPENSE - total)} à ton panier pour pouvoir l&apos;utiliser.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-base font-extrabold text-gray-900">Veux-tu l&apos;utiliser sur cette commande ?</p>
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: maxTamponsUtilisables }, (_, i) => maxTamponsUtilisables - i).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setNbTampons(k);
                          setChoixRecompenseFait(true);
                        }}
                        className={`w-full rounded-xl border-2 px-4 py-3 text-left text-base font-extrabold ${
                          choixRecompenseFait && nbTamponsEffectif === k ? "border-[#2D5A27] bg-[#2D5A27] text-white" : "border-[#2D5A27] bg-white text-gray-900"
                        }`}
                      >
                        {choixRecompenseFait && nbTamponsEffectif === k ? "✓ " : ""}Oui, utiliser {euros(k * MONTANT_RECOMPENSE)} · −{euros(k * MONTANT_RECOMPENSE)} sur ma commande
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setNbTampons(0);
                        setChoixRecompenseFait(true);
                      }}
                      className={`w-full rounded-xl border-2 px-4 py-3 text-left text-base font-extrabold ${
                        choixRecompenseFait && nbTamponsEffectif === 0 ? "border-gray-700 bg-gray-700 text-white" : "border-gray-500 bg-white text-gray-900"
                      }`}
                    >
                      {choixRecompenseFait && nbTamponsEffectif === 0 ? "✓ " : ""}Non, je la garde pour une prochaine commande
                    </button>
                  </div>
                  {choixRecompenseRequis && <p className="mt-2 text-sm font-bold text-[#8B2020]">Choisis oui ou non pour pouvoir commander.</p>}
                </>
              )}
            </div>
          )}

          {nbArticles > 0 && (
            <div className="rounded-lg border-2 border-[#2D5A27] bg-white p-3">
              {palierGroupeReel === "GROUPE_4" && (
                <p className="mb-1 text-sm font-extrabold" style={{ color: VERT }}>
                  Bravo : {nbBoissonsOffertes} boisson{nbBoissonsOffertes > 1 ? "s" : ""} 2 L offerte{nbBoissonsOffertes > 1 ? "s" : ""} !
                </p>
              )}
              {offreCanetteJour && (
                <p className="mb-1 text-sm font-extrabold" style={{ color: nbCanettesOffertes > 0 ? VERT : "#1F3A5F" }}>
                  {nbCanettesOffertes > 0
                    ? `🎁 Bravo : ${nbCanettesOffertes > 1 ? `${nbCanettesOffertes} canettes OFFERTES` : "1 canette OFFERTE"} avec cette commande ! Plus que ${euros(MONTANT_PAR_CANETTE_OFFERTE - (montantAPayer % MONTANT_PAR_CANETTE_OFFERTE))} pour la suivante.`
                    : `Plus que ${euros(MONTANT_PAR_CANETTE_OFFERTE - (montantAPayer % MONTANT_PAR_CANETTE_OFFERTE))} : 1 canette OFFERTE`}
                </p>
              )}
              {offreCadeauJour && (
                <p className="mb-1 text-sm font-extrabold" style={{ color: cadeauAcquis ? VERT : "#1F3A5F" }}>
                  {cadeauAcquis
                    ? `🎁 Bravo : ${nbBox > 1 ? `${nbBox} box OFFERTES` : "une box OFFERTE"} (3 ailes grillées + frites + 2 sauces au choix) avec cette commande !${
                        ` Plus que ${euros(resteAvantCadeau)} pour la suivante.`
                      }`
                    : `Plus que ${euros(resteAvantCadeau)} : une box OFFERTE (3 ailes grillées + frites + 2 sauces au choix)`}
                </p>
              )}
              <p className="text-sm font-extrabold text-gray-900">
                {viseBoisson2L
                  ? `Plus que ${euros(resteAvantProchaineBoisson)} : ${palierGroupeReel === "GROUPE_4" ? "une autre" : "une"} boisson 2 L offerte et ${pointsAuProchainPalier} point${pointsAuProchainPalier > 1 ? "s" : ""} de fidélité avec cette commande`
                  : `Ajoute encore ${euros(resteProchainPoint)} : tu gagnes ${pointsProchainPoint} point${pointsProchainPoint > 1 ? "s" : ""} de fidélité avec cette commande`}
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full" style={{ width: `${pourcentageProchaineBoisson}%`, backgroundColor: VERT }} />
              </div>
              {fideliteVerifiee ? (
                <>
                  {progressionTampons(fideliteVerifiee.montantCumule, fideliteVerifiee.tamponsDisponibles) > 0 && (
                    <p className="mt-2 text-sm font-extrabold text-gray-900">
                      🎁 Tu as {progressionTampons(fideliteVerifiee.montantCumule, fideliteVerifiee.tamponsDisponibles)} point
                      {progressionTampons(fideliteVerifiee.montantCumule, fideliteVerifiee.tamponsDisponibles) > 1 ? "s" : ""} de fidélité.
                    </p>
                  )}
                </>
              ) : null}
              <p className="mt-1 text-sm font-semibold text-gray-800">
                {texteProgressionCommande(
                  calculerProgressionCommande(total, fideliteVerifiee?.montantCumule ?? 0, fideliteVerifiee?.tamponsDisponibles ?? 0, nbTamponsEffectif)
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => aller("menu")}
              className="rounded-xl border-2 border-[#8B2020] bg-white py-4 text-base font-extrabold"
              style={{ color: ROUGE }}
            >
              Continuer mes achats
            </button>
            <button
              type="button"
              onClick={() => {
                if (choixRecompenseRequis) {
                  setErreur("Choisis d'abord si tu utilises ta récompense (oui ou non).");
                  document.getElementById("choix-recompense")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  return;
                }
                aller("validation");
              }}
              disabled={nbArticles === 0}
              className="rounded-xl py-4 text-base font-extrabold text-white disabled:opacity-40"
              style={{ backgroundColor: VERT }}
            >
              Commander
            </button>
          </div>
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
                  onClick={() => {
                    setCanal(valeur);
                    if (valeur === "livraison" && !lieuId && dernierLieu) {
                      changerLieu(dernierLieu.lieuId);
                      if (dernierLieu.precision) setAdresse(dernierLieu.precision);
                    }
                    if (valeur === "livraison") {
                      const possibles = creneauxLivraisonPossibles(
                        creneauxPourDate(dateCommande, parametres.heureDebut, parametres.heureFin),
                        dateCommande,
                        lieu
                      );
                      if (!possibles.includes(creneauHeure)) setCreneauHeure(possibles[0] ?? "");
                    }
                  }}
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
                  <label className="text-sm font-semibold text-gray-900">Lieu de livraison</label>
                  <select
                    value={lieuId}
                    onChange={(e) => changerLieu(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
                  >
                    <option value="">Choisis le lieu…</option>
                    <optgroup label="Lieux principaux">
                      {LIEUX_PRINCIPAUX.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nom}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Villages">
                      {VILLAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nom}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                {lieu && !lieu.sansPrecision && (
                  <div>
                    <label className="text-sm font-semibold text-gray-900">
                      {lieu.village ? "Précise l'endroit (mairie, CCAS, rue…)" : "Précision (bâtiment, salle…) — facultatif"}
                    </label>
                    <input
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Quand */}
          <section className="space-y-2 rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-extrabold text-gray-900">2. Quand ?</h3>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-3 ${
                quand === "asap" ? "border-[#8B2020] bg-[#8B2020]/10" : "border-gray-400 bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={quand === "asap"}
                onChange={(e) => (e.target.checked ? choisirAuPlusTot() : setQuand(null))}
                className="h-7 w-7 shrink-0 accent-[#8B2020]"
              />
              <span className="text-base font-extrabold text-gray-900">
                Dès que possible
                <span className="block text-sm font-semibold text-gray-800">
                  {libelleQuand}
                  {creneauHeure
                    ? canal === "livraison" && lieu?.creneaux
                      ? ` ${libelleCreneauLieu(lieu, creneauHeure)}`
                      : ` à partir de ${creneauHeure}`
                    : ""}
                </span>
              </span>
            </label>
            <p className="pt-1 text-sm font-extrabold text-gray-900">Ou choisis une heure :</p>
            <div className={`space-y-2 rounded-lg p-2 ${quand === "heure" ? "border-2 border-[#8B2020]" : "border border-gray-300"}`}>
              <DatePicker
                dates={datesOuvertes}
                aujourdHui={aujourdHui}
                valeur={dateCommande}
                onChange={(d) => {
                  setQuand("heure");
                  changerDate(d);
                }}
                label={canal === "livraison" ? "Date de livraison souhaitée" : "Date de retrait souhaitée"}
              />
              {canal === "livraison" && lieu?.creneaux ? (
                <div>
                  <p className="text-xs text-gray-700">Créneau de livraison — {lieu.nom}</p>
                  <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {lieu.creneaux.map((c) => {
                      const dispo = creneauxValides.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={!dispo}
                          onClick={() => {
                            setQuand("heure");
                            setCreneauHeure(c);
                          }}
                          className={`rounded-lg border-2 px-3 py-3 text-base font-extrabold disabled:opacity-30 ${
                            creneauHeure === c && dispo ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-400 bg-white text-gray-900"
                          }`}
                        >
                          {libelleCreneauLieu(lieu, c)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <CreneauPicker
                  creneauxValides={creneauxValides}
                  valeur={creneauHeure}
                  onChange={(c) => {
                    setQuand("heure");
                    setCreneauHeure(c);
                  }}
                  label={canal === "livraison" ? "Créneau de livraison souhaité" : "Heure de passage souhaitée"}
                />
              )}
            </div>
            {quand === null && <p className="text-sm font-bold" style={{ color: ROUGE }}>Choisis « Dès que possible » ou une heure.</p>}
            {canal === "livraison" && creneauxValides.length === 0 && (
              <p className="text-sm font-bold" style={{ color: ROUGE }}>
                Plus de créneau de livraison disponible à cette date : choisis un autre jour, ou le retrait.
              </p>
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
            <p className="text-sm font-medium text-gray-800">Tes points de fidélité sont comptés avec ce numéro.</p>
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

            </div>
            {!profilDejaConnu && <ProfilClientChoix
                valeur={profil}
                onChange={setProfil}
                explication="Une seule question, une seule fois : elle nous permet de te proposer des offres qui te correspondent. Ta réponse reste confidentielle."
              />}
            {/* Le client s'est identifié au début : plus de question ici. Reste montée, invisible, pour garder reconnaissance et préremplissage. */}
            <div className="hidden">
              <CarteFidelite {...proprietesCarteFidelite} />
            </div>
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

          {blocChoixSauces}

          {blocChoixCanette}

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

          <MessageErreur message={erreur} />

          <button
            type="button"
            onClick={commander}
            disabled={envoiEnCours || nbArticles === 0}
            className="w-full rounded-xl py-4 text-lg font-extrabold text-white disabled:opacity-40"
            style={{ backgroundColor: VERT }}
          >
            {envoiEnCours ? "Envoi…" : `Commander · ${euros(montantAPayer)}`}
          </button>
          <FooterLegal />
        </div>
      )}

      {/* Barre du bas : « Plat suivant » en mode plusieurs, puis panier */}
      {vue === "menu" && mode !== null && (enGroupe || nbArticles > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-lg space-y-2">
            {enGroupe &&
              (resteAuPlatActif > 0 ? (
                <div className="rounded-xl border-2 border-gray-500 bg-white px-4 py-3 text-center shadow-lg">
                  <p className="text-sm font-extrabold text-gray-900">
                    {totalPlatActif === 0
                      ? `Choisis les produits du plat ${platActif + 1}`
                      : `Ajoute encore ${euros(resteAuPlatActif)} pour passer au plat suivant`}
                  </p>
                </div>
              ) : (
                // Plus de clignotement (il rendait le bouton flou) : un bloc net, très contrasté, avec une bordure et un halo fixes.
                <button
                  type="button"
                  onClick={platSuivant}
                  className="flex w-full items-center justify-between rounded-xl border-4 border-white px-5 py-3 text-left text-white shadow-2xl ring-4 ring-[#1E3A8A]/40 active:scale-[0.99]"
                  style={{ backgroundColor: "#1E3A8A" }}
                >
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wide">Plat {platActif + 1} complet ✓</span>
                    <span className="block text-xl font-extrabold">Passer au plat {platActif + 2}</span>
                  </span>
                  <span className="text-4xl font-extrabold leading-none" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            {nbArticles > 0 && (
              <button
                type="button"
                onClick={() => aller("panier")}
                className={`flex w-full items-center justify-between rounded-xl px-5 py-3 text-white shadow-lg transition-transform duration-200 ${
                  pulse ? "scale-105" : "scale-100"
                }`}
                style={{ backgroundColor: enGroupe ? ROUGE : VERT }}
              >
                <span className="text-base font-extrabold">
                  {enGroupe ? `Plat ${platActif + 1}` : `${nbArticles} article${nbArticles > 1 ? "s" : ""}`}
                </span>
                <span className="text-base font-extrabold">{enGroupe && nbPlatsRemplis >= 2 ? "C'est tout → voir le panier" : "Voir le panier"}</span>
                <span className="whitespace-nowrap text-base font-extrabold">{euros(enGroupe ? totalPlatActif : total)}</span>
              </button>
            )}
          </div>
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
        <ConfigurateurNouveau
          produit={produitEnSelection}
          viandes={viandes}
          sauces={sauces}
          saveurs={saveursFormule(produitEnSelection, saveurs)}
          accompagnements={accompagnements}
          produitViandeSupplementaire={produitViandeSupplementaire}
          produitSauceSupplementaire={produitSauceSupplementaire}
          canetteRapideProduit={produitEnSelection.categorie === "plat_du_jour" ? produitCanetteRapide : null}
          canetteRapideSaveurs={saveurs}
          boissons50cl={boissons50cl}
          quantiteMax={
            produitEnSelection.stockJour !== null
              ? plafonnerQuantite(produitEnSelection, ligneEnModification?.id ?? null, produitEnSelection.stockJour)
              : undefined
          }
          initial={
            ligneEnModification
              ? {
                  quantite: ligneEnModification.quantite,
                  viandes: [...ligneEnModification.viandes, ...ligneEnModification.viandesSupp],
                  sauces: [...ligneEnModification.sauces, ...ligneEnModification.saucesSupp],
                  sansSauce: ligneEnModification.sansSauce,
                  oignonsFrits: ligneEnModification.oignonsFrits,
                  boisson: ligneEnModification.boissonIncluse,
                  saladeGardee: ligneEnModification.saladeIncluse,
                  saladeOption: ligneEnModification.saladeOption,
                  accompagnements: ligneEnModification.accompagnementsInclus,
                }
              : undefined
          }
          onAnnuler={() => {
            setProduitEnSelection(null);
            setLigneEnModification(null);
          }}
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
            // Les suppléments (viande / sauce en plus) font partie du tacos lui-même. Avec plusieurs
            // exemplaires, ils vont sur UN seul : jamais répétés sur chaque exemplaire par erreur.
            const aDesSupplements =
              extras.viandesSupplementaires.length > 0 || extras.saucesSupplementaires.length > 0 || extras.oignonsFrits === true;
            if (ligneEnModification) {
              // Modification : la ligne est remplacée à sa place (même plat), jamais supprimée puis recréée.
              const ancienne = ligneEnModification;
              const quantitePrincipale = aDesSupplements ? 1 : quantite;
              setPanier((precedent) =>
                precedent.map((x) =>
                  x.id === ancienne.id
                    ? {
                        ...x,
                        viandes: viandesChoisies,
                        sauces: saucesChoisies,
                        boissonIncluse,
                        sansBoisson,
                        sansSauce,
                        saladeOption,
                        saladeIncluse,
                        accompagnementsInclus,
                        viandesSupp: extras.viandesSupplementaires,
                        saucesSupp: extras.saucesSupplementaires,
                        oignonsFrits: extras.oignonsFrits === true,
                        quantite: Math.max(1, plafonnerQuantite(x.produit, x.id, quantitePrincipale)),
                      }
                    : x
                )
              );
              if (aDesSupplements && quantite > 1) {
                ajouterAuPanier(
                  produitEnSelection,
                  viandesChoisies,
                  saucesChoisies,
                  [],
                  boissonIncluse,
                  quantite - 1,
                  saladeIncluse,
                  accompagnementsInclus,
                  sansBoisson,
                  sansSauce,
                  saladeOption,
                  [],
                  [],
                  ancienne.plat
                );
              }
              if (produitCanetteRapide) {
                for (const saveur of canettesRapidesChoisies) {
                  ajouterAuPanier(produitCanetteRapide, [], [], [saveur], null, 1, null, [], false, false, false, [], [], ancienne.plat);
                }
              }
              setLigneEnModification(null);
              setProduitEnSelection(null);
              return;
            }
            if (aDesSupplements && quantite > 1) {
              ajouterAuPanier(
                produitEnSelection,
                viandesChoisies,
                saucesChoisies,
                [],
                boissonIncluse,
                quantite - 1,
                saladeIncluse,
                accompagnementsInclus,
                sansBoisson,
                sansSauce,
                saladeOption
              );
            }
            ajouterAuPanier(
              produitEnSelection,
              viandesChoisies,
              saucesChoisies,
              [],
              boissonIncluse,
              aDesSupplements ? 1 : quantite,
              saladeIncluse,
              accompagnementsInclus,
              sansBoisson,
              sansSauce,
              saladeOption,
              extras.viandesSupplementaires,
              extras.saucesSupplementaires,
              undefined,
              extras.oignonsFrits === true
            );
            if (produitCanetteRapide) {
              for (const saveur of canettesRapidesChoisies) {
                ajouterAuPanier(produitCanetteRapide, [], [], [saveur], null, 1);
              }
            }
            setProduitEnSelection(null);
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
