import type { CommandePourImpression } from "./types";
import { SEUIL_COMMANDE_PRIORITAIRE } from "@/lib/plats";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { regrouperLignesParCategorie } from "@/lib/caisse/regroupement-lignes";
import type { LigneCommande } from "@/lib/caisse/types";
import { formaterTelephoneAffichage } from "@/lib/telephone";

/**
 * Construction du XML ePOS-Print d'Epson pour les deux tickets (reçu
 * client + bon de cuisine). Depuis 2026-10-13, l'impression ne dépend plus
 * d'aucun appareil local (ni navigateur, ni relais, ni Mac/iPad allumé) :
 * l'imprimante va elle-même chercher son travail via Server Direct Print
 * (`app/api/print/epson/[token]`), qui utilise les variantes `*Brut`
 * ci-dessous (sans enveloppe SOAP, cf. `eposPrintSeul` — Server Direct
 * Print n'accepte jamais l'enveloppe SOAP classique). Les variantes avec
 * enveloppe (`construireTicketClientXml`/`construireBonCuisineXml`) ne
 * sont plus utilisées, conservées uniquement si un envoi direct
 * navigateur→imprimante redevenait nécessaire un jour.
 *
 * Aucune librairie tierce : le protocole est un simple XML documenté par
 * Epson, et le QR code est généré par l'imprimante elle-même via
 * `<symbol type="qrcode_model_2">` — pas besoin de le rasteriser côté code.
 */


function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type StyleLigne = { align?: "left" | "center" | "right"; gras?: boolean; taille?: 1 | 2 | 3 };

function styleTexte(opts: StyleLigne = {}): string {
  const attrs: string[] = [];
  if (opts.align) attrs.push(`align="${opts.align}"`);
  if (opts.gras !== undefined) attrs.push(`em="${opts.gras}"`);
  if (opts.taille !== undefined) attrs.push(`width="${opts.taille}" height="${opts.taille}"`);
  return attrs.length > 0 ? `<text ${attrs.join(" ")}/>` : "";
}

/**
 * Colonnes disponibles par taille de police (Epson TM-m30III, Font A,
 * papier 80mm) — la largeur double/triple divise le nombre de caractères
 * par ligne d'autant, c'est ce décalage non pris en compte qui coupait des
 * mots en plein milieu ("S / ur place") avant ce correctif.
 */
const COLONNES: Record<1 | 2 | 3, number> = { 1: 42, 2: 21, 3: 14 };

/** Découpe un texte en sous-lignes sans jamais couper un mot — repli caractère par caractère uniquement si un seul mot dépasse la largeur. */
function decouperEnLignes(texte: string, colonnes: number): string[] {
  const mots = texte.split(" ");
  const lignes: string[] = [];
  let courante = "";

  for (const mot of mots) {
    if (mot.length > colonnes) {
      if (courante) {
        lignes.push(courante);
        courante = "";
      }
      let reste = mot;
      while (reste.length > colonnes) {
        lignes.push(reste.slice(0, colonnes));
        reste = reste.slice(colonnes);
      }
      courante = reste;
      continue;
    }
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length > colonnes) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante) lignes.push(courante);
  return lignes.length > 0 ? lignes : [""];
}

/**
 * Accumulateur de XML qui garde la trace de la taille de police en cours
 * (le protocole ePOS-Print est stateful : un `<text .../>` de style reste
 * actif tant qu'il n'est pas remplacé) pour savoir sur combien de colonnes
 * découper chaque ligne, même quand un appel ne repasse pas de style.
 */
function creerConstructeurTicket() {
  let xml = "";
  let tailleCourante: 1 | 2 | 3 = 1;

  function brut(fragment: string) {
    xml += fragment;
  }

  function ligne(texte: string, style?: StyleLigne, indent = "") {
    if (style) {
      xml += styleTexte(style);
      if (style.taille !== undefined) tailleCourante = style.taille;
    }
    const colonnes = Math.max(1, COLONNES[tailleCourante] - indent.length);
    for (const sousLigne of decouperEnLignes(texte, colonnes)) {
      xml += `<text>${echapperXml(indent + sousLigne)}\n</text>`;
    }
  }

  return { ligne, brut, xml: () => xml };
}

type ConstructeurTicket = ReturnType<typeof creerConstructeurTicket>;

const SEPARATEUR = "-".repeat(32);

/** Remet systématiquement le style à gauche/normal avant un séparateur, pour ne jamais hériter d'un gros titre précédent. */
function separateur(b: ConstructeurTicket): void {
  b.ligne(SEPARATEUR, { align: "left", gras: false, taille: 1 });
}

function libelleCanal(canal: CommandePourImpression["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

function libelleModePaiement(mode: CommandePourImpression["modePaiement"]): string {
  if (mode === "cb") return "Carte";
  if (mode === "stripe") return "En ligne";
  if (mode === "mixte") return "Mixte (espèces + carte)";
  return "Espèces";
}

/** "#0001", "#0042", "#12345" (jamais tronqué au-delà de 4 chiffres). */
function formaterNumeroTicket(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

const MENTION_LEGALE = "3 Sauces — Auto-entrepreneur — SIRET 532 276 581 00040 — TVA non applicable, art. 293 B du CGI";

function formaterDateHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function jourMayotte(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
}

function estAujourdhuiMayotte(iso: string): boolean {
  return jourMayotte(iso) === jourMayotte(new Date().toISOString());
}

/**
 * Heure seule pour une commande à récupérer aujourd'hui, jour + heure pour
 * une commande à l'avance — sans ça, un ticket imprimé plusieurs jours avant
 * la date de retrait ne montrerait qu'une heure, sans dire de quel jour.
 */
function libelleHeureSouhaitee(iso: string): string {
  if (estAujourdhuiMayotte(iso)) return formaterHeure(iso);
  const jourHeure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return jourHeure;
}

/** Description d'une ligne de panier : "2x Tacos 2 viandes" puis le détail en dessous. */
function detailLigne(l: CommandePourImpression["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  if (l.boissonIncluse) details.push(`Boisson incluse : ${l.boissonIncluse}`);
  if (l.sansBoisson) details.push("SANS BOISSON — ne pas donner de canette");
  if (l.accompagnementsInclus?.length)
    details.push(`Accompagnement : ${l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
}

interface AttributCuisine {
  label: string;
  valeur: string;
}

/**
 * Même détail que `detailLigne`, mais label et valeur séparés — le bon de
 * cuisine imprime le label en petit/normal et la valeur en gras juste en
 * dessous, pour que viande/sauces/boisson se distinguent d'un coup d'œil du
 * reste (retour du patron après les premiers tickets imprimés en réel,
 * 2026-10-12 : tout avait la même graisse, impossible à scanner vite).
 */
function attributsCuisine(l: LigneCommande): AttributCuisine[] {
  const attributs: AttributCuisine[] = [];
  if (l.viandes.length > 0) attributs.push({ label: "Viande", valeur: l.viandes.join(", ") });
  if (l.sauces && l.sauces.length > 0) attributs.push({ label: "Sauces", valeur: l.sauces.join(", ") });
  if (l.saveurs && l.saveurs.length > 0) attributs.push({ label: "Saveur", valeur: l.saveurs.join(", ") });
  if (l.boissonIncluse) attributs.push({ label: "Boisson", valeur: l.boissonIncluse });
  if (l.accompagnementsInclus?.length)
    attributs.push({ label: "Accompagnement", valeur: l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ") });
  return attributs;
}

function estPrioritaire(commande: CommandePourImpression): boolean {
  return commande.canal === "livraison" && commande.nbPlats >= SEUIL_COMMANDE_PRIORITAIRE;
}

/** Clé d'égalité pour fusionner deux lignes identiques sur le bon de cuisine — jamais à travers deux plats/convives différents d'une commande groupée. */
function cleLigne(l: LigneCommande): string {
  return JSON.stringify([
    l.nom,
    [...l.viandes].sort(),
    [...(l.sauces ?? [])].sort(),
    [...(l.saveurs ?? [])].sort(),
    l.boissonIncluse ?? null,
    l.sansBoisson ?? false,
    [...(l.accompagnementsInclus ?? [])].sort(),
    l.pourQui ?? null,
    l.platIndex,
  ]);
}

/** "3x Kebab" au lieu de 3 lignes identiques — bon de cuisine uniquement (le reçu client garde une ligne par article, avec son prix). */
function fusionnerLignesIdentiques(lignes: LigneCommande[]): LigneCommande[] {
  const parCle = new Map<string, LigneCommande>();
  for (const l of lignes) {
    const cle = cleLigne(l);
    const existante = parCle.get(cle);
    if (existante) {
      existante.quantite += l.quantite;
    } else {
      parCle.set(cle, { ...l });
    }
  }
  return [...parCle.values()];
}

function imprimerGroupeCategorieCuisine(b: ConstructeurTicket, lignes: LigneCommande[]): void {
  for (const groupe of regrouperLignesParCategorie(fusionnerLignesIdentiques(lignes))) {
    b.ligne(groupe.titre, { gras: true, taille: 1 });
    for (const l of groupe.lignes) {
      b.ligne(`${l.quantite * piecesParPaquet(l.nom)}x ${nomSansMultiplicateur(l.nom).toUpperCase()}`, { gras: true, taille: 2 });
      for (const { label, valeur } of attributsCuisine(l)) {
        b.ligne(label, { gras: false, taille: 1 }, "  ");
        b.ligne(valeur.toUpperCase(), { gras: true, taille: 1 }, "  ");
      }
      if (l.sansBoisson) b.ligne("SANS BOISSON — ne pas donner de canette", { gras: true, taille: 1 }, "  ");
      if (l.pourQui) b.ligne(`Pour ${l.pourQui}`, { gras: true, taille: 1 }, "  ");
    }
  }
}

/** Commande groupée (au moins une ligne avec `platIndex`) : un bloc "PLAT N" par convive plutôt qu'un classement par catégorie. */
function imprimerArticlesCuisine(b: ConstructeurTicket, commande: CommandePourImpression): void {
  const estGroupee = commande.lignes.some((l) => l.platIndex !== null);
  if (!estGroupee) {
    imprimerGroupeCategorieCuisine(b, commande.lignes);
    return;
  }

  const indices = [...new Set(commande.lignes.map((l) => l.platIndex).filter((i): i is number => i !== null))].sort((a, bb) => a - bb);
  for (const indexPlat of indices) {
    const lignesPlat = commande.lignes.filter((l) => l.platIndex === indexPlat);
    const pourQui = lignesPlat.find((l) => l.pourQui)?.pourQui;
    b.ligne(`PLAT ${indexPlat + 1}${pourQui ? ` — ${pourQui}` : ""}`, { align: "left", gras: true, taille: 2 });
    imprimerGroupeCategorieCuisine(b, lignesPlat);
  }
  separateur(b);
  b.ligne(`${commande.nbPlats} plat${commande.nbPlats > 1 ? "s" : ""}`, { align: "center", gras: true, taille: 1 });
}

const URL_SITE = "https://3sauces.fr";
const BORDURE_LIVRAISON = "=".repeat(32);

/**
 * Bloc encadré bien visible pour une livraison (nom, lieu, adresse,
 * téléphone en gros, total à payer) — demande explicite du patron le
 * 2026-10-13 : sur le reçu classique ces infos se perdaient, trop petites
 * et serrées au milieu du reste, alors que c'est l'essentiel pour le
 * livreur d'un coup d'œil.
 */
function imprimerBlocLivraison(b: ConstructeurTicket, commande: CommandePourImpression): void {
  b.ligne(BORDURE_LIVRAISON, { align: "center", gras: true, taille: 1 });
  b.ligne("LIVRAISON", { align: "center", gras: true, taille: 2 });
  b.ligne(BORDURE_LIVRAISON, { align: "center", gras: true, taille: 1 });
  b.ligne(commande.nom, { align: "left", gras: true, taille: 2 });
  if (commande.zoneLivraison) b.ligne(commande.zoneLivraison, { align: "left", gras: true, taille: 2 });
  if (commande.adresse) b.ligne(commande.adresse, { align: "left", gras: true, taille: 1 });
  if (commande.clientTelephone) {
    b.ligne(formaterTelephoneAffichage(commande.clientTelephone), { align: "left", gras: true, taille: 2 });
  }
  const libelleMontant = commande.modePaiement === "stripe" ? "DEJA PAYE" : "A PAYER";
  b.ligne(`${libelleMontant} : ${commande.montant.toFixed(2)} €`, { align: "left", gras: true, taille: 2 });
  b.ligne(BORDURE_LIVRAISON, { align: "center", gras: true, taille: 1 });
}

function imprimerBlocFidelite(b: ConstructeurTicket, commande: CommandePourImpression): void {
  separateur(b);
  b.ligne("FIDÉLITÉ", { align: "center", gras: true, taille: 1 });
  b.ligne("10€ dépensés = 1 tampon", { align: "center", gras: false, taille: 1 });
  b.ligne("10 tampons = 10€ offerts", { align: "center", gras: false, taille: 1 });

  if (commande.clientTelephone && commande.tamponsAffiches !== null) {
    const tampon = commande.tamponsAffiches > 1 ? "tampons" : "tampon";
    b.ligne(`Tu as ${commande.tamponsAffiches} ${tampon}`, { align: "center", gras: true, taille: 2 });
    if (commande.recompenseDisponible) {
      b.ligne("RÉCOMPENSE DISPONIBLE — 10€ offerts", { align: "center", gras: true, taille: 1 });
    }
  } else {
    b.ligne("Suivez vos tampons sur 3sauces.fr/fidelite", { align: "center", gras: false, taille: 1 });
  }
}

/** Message du moment (si actif) + QR vers le site (jamais en livraison, pour ne pas le confondre avec le QR livreur). */
function imprimerBlocCommunication(b: ConstructeurTicket, commande: CommandePourImpression): void {
  if (!commande.messageDuMoment && commande.canal === "livraison") return;
  separateur(b);
  if (commande.messageDuMoment) {
    b.ligne(commande.messageDuMoment, { align: "center", gras: false, taille: 1 });
  }
  if (commande.canal !== "livraison") {
    b.brut(`<feed line="1"/>`);
    b.brut(styleTexte({ align: "center" }));
    b.brut(`<symbol type="qrcode_model_2" level="level_m" width="4">${echapperXml(URL_SITE)}</symbol>`);
  }
}

const NAMESPACE_EPOS_PRINT = "http://www.epson-pos.com/schemas/2011/03/epos-print";

/** `<epos-print>...</epos-print>` seul, sans enveloppe — c'est ce que Server Direct Print attend dans `<PrintData>` (un `<epos-print>` niché dans une autre enveloppe XML, celle de `enveloppeEposPrint`, ne parse jamais côté imprimante). */
function eposPrintSeul(contenu: string): string {
  return `<epos-print xmlns="${NAMESPACE_EPOS_PRINT}">${contenu}</epos-print>`;
}

/** Enveloppe SOAP complète — uniquement pour l'envoi direct/relais (POST classique vers l'IP de l'imprimante), jamais pour Server Direct Print. */
function enveloppeEposPrint(contenu: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${eposPrintSeul(contenu)}</s:Body></s:Envelope>`;
}

function construireContenuTicketClient(
  commande: CommandePourImpression,
  logo: { base64: string; largeur: number; hauteur: number } | null
): string {
  const b = creerConstructeurTicket();

  if (logo) {
    b.brut(`<image width="${logo.largeur}" height="${logo.hauteur}" color="color_1" mode="mono">${logo.base64}</image>`);
  }

  b.ligne("3 SAUCES", { align: "center", gras: true, taille: 2 });
  b.ligne(formaterNumeroTicket(commande.numero), { align: "center", gras: true, taille: 2 });
  b.ligne(formaterDateHeure(commande.creeLe), { align: "center", gras: false, taille: 1 });

  if (commande.modePaiement === "stripe") {
    b.ligne("*** DEJA PAYEE EN LIGNE ***", { align: "center", gras: true, taille: 2 });
    b.ligne("NE PAS FAIRE PAYER", { align: "center", gras: true, taille: 2 });
  }

  b.ligne(commande.nom, { align: "left", gras: true, taille: 2 });
  separateur(b);

  for (const groupe of regrouperLignesParCategorie(commande.lignes)) {
    b.ligne(groupe.titre, { gras: true, taille: 1 });
    for (const l of groupe.lignes) {
      const prixLigne = l.quantite * l.prixUnitaire;
      b.ligne(`${l.quantite * piecesParPaquet(l.nom)}x ${nomSansMultiplicateur(l.nom)} - ${prixLigne.toFixed(2)} €`, {
        gras: true,
        taille: 1,
      });
      for (const detail of detailLigne(l)) {
        b.ligne(detail, { gras: false, taille: 1 }, "  ");
      }
    }
  }

  separateur(b);
  b.ligne(`TOTAL : ${commande.montant.toFixed(2)} €`, { gras: true, taille: 2 });
  b.ligne(`Paiement : ${libelleModePaiement(commande.modePaiement)}`, { gras: commande.modePaiement === "stripe", taille: 1 });
  if (commande.modePaiement === "stripe") {
    b.ligne("*** DEJA PAYEE — NE RIEN DEMANDER ***", { align: "center", gras: true, taille: 2 });
  }

  const heureLabel = commande.heureSouhaitee ? libelleHeureSouhaitee(commande.heureSouhaitee) : null;
  b.ligne(`${libelleCanal(commande.canal).toUpperCase()}${heureLabel ? ` · ${heureLabel}` : ""}`, {
    align: "left",
    gras: true,
    taille: 1,
  });

  if (commande.canal === "livraison") {
    imprimerBlocLivraison(b, commande);
    if (commande.qrCode) {
      b.brut(`<feed line="1"/>`);
      b.brut(styleTexte({ align: "center" }));
      b.brut(`<symbol type="qrcode_model_2" level="level_m" width="4">${echapperXml(commande.qrCode)}</symbol>`);
    }
  }

  imprimerBlocFidelite(b, commande);
  imprimerBlocCommunication(b, commande);

  separateur(b);
  b.ligne(MENTION_LEGALE, { align: "center", gras: false, taille: 1 });

  b.brut(`<feed line="2"/><cut type="feed"/>`);
  return b.xml();
}

export function construireTicketClientXml(
  commande: CommandePourImpression,
  logo: { base64: string; largeur: number; hauteur: number } | null
): string {
  return enveloppeEposPrint(construireContenuTicketClient(commande, logo));
}

/** Pour Server Direct Print (`<PrintData>`) — jamais d'enveloppe SOAP, cf. `eposPrintSeul`. */
export function construireTicketClientXmlBrut(
  commande: CommandePourImpression,
  logo: { base64: string; largeur: number; hauteur: number } | null
): string {
  return eposPrintSeul(construireContenuTicketClient(commande, logo));
}

function construireContenuBonCuisine(commande: CommandePourImpression): string {
  const b = creerConstructeurTicket();

  if (estPrioritaire(commande)) {
    b.ligne("★ PRIORITAIRE ★", { align: "center", gras: true, taille: 2 });
  }

  b.ligne(`${formaterNumeroTicket(commande.numero)} - ${libelleCanal(commande.canal).toUpperCase()}`, {
    align: "center",
    gras: true,
    taille: 2,
  });

  if (commande.modePaiement === "stripe") {
    b.ligne("DEJA PAYEE EN LIGNE", { align: "center", gras: true, taille: 1 });
  }
  if (commande.heureSouhaitee) {
    b.ligne(libelleHeureSouhaitee(commande.heureSouhaitee), { align: "center", gras: false, taille: 1 });
  }

  b.ligne(commande.nom, { align: "center", gras: true, taille: 2 });
  if (commande.canal === "livraison" && commande.clientTelephone) {
    b.ligne(`Tél : ${formaterTelephoneAffichage(commande.clientTelephone)}`, { align: "center", gras: true, taille: 1 });
  }
  separateur(b);

  imprimerArticlesCuisine(b, commande);

  b.brut(`<feed line="2"/><cut type="feed"/>`);
  return b.xml();
}

export function construireBonCuisineXml(commande: CommandePourImpression): string {
  return enveloppeEposPrint(construireContenuBonCuisine(commande));
}

/** Pour Server Direct Print (`<PrintData>`) — jamais d'enveloppe SOAP, cf. `eposPrintSeul`. */
export function construireBonCuisineXmlBrut(commande: CommandePourImpression): string {
  return eposPrintSeul(construireContenuBonCuisine(commande));
}

