import type { CommandePourImpression, ConfigImprimante, ResultatImpression } from "./types";
import { SEUIL_COMMANDE_PRIORITAIRE } from "@/lib/plats";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";

/**
 * Protocole ePOS-Print d'Epson (TM-m30 et quasi toute la gamme TM-*) : une
 * requête XML enveloppée SOAP, postée en HTTP(S) directement depuis le
 * navigateur vers l'adresse IP locale de l'imprimante — jamais depuis le
 * serveur Next.js/Vercel, qui n'a aucun accès au réseau WiFi du restaurant.
 * `port` par défaut 8043 (SSL) : le site est servi en HTTPS, une requête
 * vers du HTTP simple (port 80) serait bloquée par le navigateur comme
 * "contenu mixte". La première connexion à chaque imprimante depuis l'iPad
 * nécessite d'accepter une fois son certificat auto-signé dans Safari
 * (réglage réseau à faire sur place, pas quelque chose que ce code peut
 * automatiser).
 *
 * Aucune librairie tierce : le protocole est un simple POST XML documenté
 * par Epson, et le QR code est généré par l'imprimante elle-même via
 * `<symbol type="qrcode_model_2">` — pas besoin de le rasteriser côté code.
 */

const TIMEOUT_MS = 5000;

function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function styleTexte(opts: { align?: "left" | "center" | "right"; gras?: boolean; taille?: 1 | 2 | 3 } = {}): string {
  const attrs: string[] = [];
  if (opts.align) attrs.push(`align="${opts.align}"`);
  if (opts.gras !== undefined) attrs.push(`em="${opts.gras}"`);
  if (opts.taille !== undefined) attrs.push(`width="${opts.taille}" height="${opts.taille}"`);
  return attrs.length > 0 ? `<text ${attrs.join(" ")}/>` : "";
}

/** Une ligne de texte imprimée, avec un style optionnel appliqué juste avant. */
function ligne(texte: string, style?: Parameters<typeof styleTexte>[0]): string {
  return `${styleTexte(style ?? {})}<text>${echapperXml(texte)}\n</text>`;
}

function libelleCanal(canal: CommandePourImpression["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

function libelleModePaiement(mode: CommandePourImpression["modePaiement"]): string {
  if (mode === "cb") return "Carte";
  if (mode === "stripe") return "En ligne";
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
  if (l.accompagnementsInclus?.length) details.push(`Accompagnement : ${l.accompagnementsInclus.join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
}

function estPrioritaire(commande: CommandePourImpression): boolean {
  return commande.canal === "livraison" && commande.nbPlats >= SEUIL_COMMANDE_PRIORITAIRE;
}

function enveloppeEposPrint(contenu: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${contenu}</epos-print></s:Body></s:Envelope>`;
}

export function construireTicketClientXml(
  commande: CommandePourImpression,
  logo: { base64: string; largeur: number; hauteur: number } | null
): string {
  let xml = "";

  if (logo) {
    xml += `<image width="${logo.largeur}" height="${logo.hauteur}" color="color_1" mode="mono">${logo.base64}</image>`;
  }

  xml += ligne("3 SAUCES", { align: "center", gras: true, taille: 2 });
  xml += ligne(`Commande ${formaterNumeroTicket(commande.numero)}`, { align: "center", gras: true });
  xml += styleTexte({ align: "left", gras: false, taille: 1 });
  xml += ligne(formaterDateHeure(commande.creeLe));
  xml += ligne(`Client : ${commande.nom}`);
  xml += ligne("--------------------------------");

  for (const l of commande.lignes) {
    xml += ligne(`${l.quantite * piecesParPaquet(l.nom)}x ${nomSansMultiplicateur(l.nom)}`, { gras: true });
    for (const detail of detailLigne(l)) {
      xml += ligne(`  ${detail}`);
    }
  }

  xml += ligne("--------------------------------");
  xml += ligne(`TOTAL : ${commande.montant.toFixed(2)} €`, { gras: true, taille: 2 });
  xml += ligne(`Mode de récupération : ${libelleCanal(commande.canal)}`);

  const commandeAvance = commande.heureSouhaitee ? !estAujourdhuiMayotte(commande.heureSouhaitee) : false;

  if (commande.canal === "livraison") {
    if (commande.adresse) xml += ligne(`Adresse : ${commande.adresse}`);
  }
  // Une commande à l'avance garde une trace écrite du jour de retrait sur le
  // ticket, quel que soit le canal — pas seulement en livraison.
  if (commande.heureSouhaitee && (commande.canal === "livraison" || commandeAvance)) {
    xml += ligne(`Heure souhaitée : ${libelleHeureSouhaitee(commande.heureSouhaitee)}`);
  }

  xml += ligne(`Paiement : ${libelleModePaiement(commande.modePaiement)}`);

  if (commande.canal === "livraison" && commande.qrCode) {
    xml += `<feed line="1"/>`;
    xml += styleTexte({ align: "center" });
    xml += `<symbol type="qrcode_model_2" level="level_m" width="4">${echapperXml(commande.qrCode)}</symbol>`;
  }

  xml += `<feed line="1"/>`;
  xml += ligne("--------------------------------");
  xml += ligne("Fidelite : chaque euro compte !", { align: "center", gras: true });
  xml += ligne("Suivez vos tampons sur 3sauces.fr/fidelite", { align: "center" });
  xml += ligne("--------------------------------");
  xml += ligne(MENTION_LEGALE, { align: "center" });

  xml += `<feed line="2"/><cut type="feed"/>`;
  return enveloppeEposPrint(xml);
}

export function construireBonCuisineXml(commande: CommandePourImpression): string {
  let xml = "";

  if (estPrioritaire(commande)) {
    xml += ligne("*** PRIORITAIRE ***", { align: "center", gras: true, taille: 2 });
  }
  xml += ligne(`Commande #${commande.numero}`, { align: "center", gras: true, taille: 2 });
  if (commande.heureSouhaitee) {
    xml += ligne(`Heure souhaitée : ${libelleHeureSouhaitee(commande.heureSouhaitee)}`, { align: "center", gras: true });
  }
  xml += ligne(libelleCanal(commande.canal), { align: "center" });
  xml += styleTexte({ align: "left", gras: false, taille: 1 });
  xml += ligne("--------------------------------");

  for (const l of commande.lignes) {
    xml += ligne(`${l.quantite * piecesParPaquet(l.nom)}x ${nomSansMultiplicateur(l.nom)}`, {
      gras: true,
      taille: 2,
    });
    for (const detail of detailLigne(l)) {
      xml += ligne(`  ${detail}`, { taille: 1 });
    }
  }

  xml += `<feed line="2"/><cut type="feed"/>`;
  return enveloppeEposPrint(xml);
}

export async function envoyerImpression(xml: string, config: ConfigImprimante): Promise<ResultatImpression> {
  const url = `https://${config.adresseIp}:${config.port}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: xml,
      signal: controleur.signal,
    });

    const texte = await reponse.text();
    if (!reponse.ok || !texte.includes('success="true"')) {
      return { ok: false, erreur: `Réponse imprimante inattendue (HTTP ${reponse.status}).` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue.";
    return { ok: false, erreur: `Imprimante injoignable (${config.adresseIp}) : ${message}` };
  } finally {
    clearTimeout(minuteur);
  }
}
