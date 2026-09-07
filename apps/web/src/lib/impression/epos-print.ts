import type { CommandePourImpression, ConfigImprimante, ResultatImpression } from "./types";

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

/** Description d'une ligne de panier : "2x Tacos 2 viandes" puis le détail en dessous. */
function detailLigne(l: CommandePourImpression["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  if (l.boissonIncluse) details.push(`Boisson incluse : ${l.boissonIncluse}`);
  return details;
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
  xml += ligne(`Commande #${commande.numero}`, { align: "center", gras: true });
  xml += styleTexte({ align: "left", gras: false, taille: 1 });
  xml += ligne(formaterDateHeure(commande.creeLe));
  xml += ligne(`Client : ${commande.nom}`);
  xml += ligne("--------------------------------");

  for (const l of commande.lignes) {
    xml += ligne(`${l.quantite}x ${l.nom}`, { gras: true });
    for (const detail of detailLigne(l)) {
      xml += ligne(`  ${detail}`);
    }
  }

  xml += ligne("--------------------------------");
  xml += ligne(`TOTAL : ${commande.montant.toFixed(2)} €`, { gras: true, taille: 2 });
  xml += ligne(`Mode de récupération : ${libelleCanal(commande.canal)}`);

  if (commande.canal === "livraison") {
    if (commande.adresse) xml += ligne(`Adresse : ${commande.adresse}`);
    if (commande.heureSouhaitee) xml += ligne(`Heure souhaitée : ${formaterHeure(commande.heureSouhaitee)}`);
  }

  xml += ligne(`Paiement : ${commande.modePaiement === "cb" ? "Carte" : "Espèces"}`);

  if (commande.canal === "livraison" && commande.qrCode) {
    xml += `<feed line="1"/>`;
    xml += styleTexte({ align: "center" });
    xml += `<symbol type="qrcode_model_2" level="level_m" width="4">${echapperXml(commande.qrCode)}</symbol>`;
  }

  xml += `<feed line="2"/><cut type="feed"/>`;
  return enveloppeEposPrint(xml);
}

export function construireBonCuisineXml(commande: CommandePourImpression): string {
  let xml = "";

  xml += ligne(`Commande #${commande.numero}`, { align: "center", gras: true, taille: 2 });
  if (commande.heureSouhaitee) {
    xml += ligne(`Heure souhaitée : ${formaterHeure(commande.heureSouhaitee)}`, { align: "center", gras: true });
  }
  xml += ligne(libelleCanal(commande.canal), { align: "center" });
  xml += styleTexte({ align: "left", gras: false, taille: 1 });
  xml += ligne("--------------------------------");

  for (const l of commande.lignes) {
    xml += ligne(`${l.quantite}x ${l.nom}`, { gras: true, taille: 2 });
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
