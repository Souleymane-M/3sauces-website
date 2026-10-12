import { NextResponse } from "next/server";
import { construireTicketClientXml, construireBonCuisineXml } from "@/lib/impression/epos-print";
import { marquerTicketImprime, listerCommandesDuJourAImprimer } from "@/lib/caisse/nouvelles-commandes";
import { trouverImprimantePourJetonDirectPrint } from "@/lib/patron/imprimantes";

/**
 * Là où l'imprimante Epson (fonction "Server Direct Print", activée
 * directement sur l'imprimante — Services → Server Direct Print) vient
 * elle-même chercher son travail toutes les quelques secondes, sans
 * dépendre d'un relais local toujours allumé (cf. scripts/relais-impression/
 * README.md, section historique). Jamais de session ici : l'imprimante ne
 * porte pas de cookie, le jeton dans l'URL EST l'authentification — voir
 * `trouverImprimantePourJetonDirectPrint`.
 *
 * Protocole confirmé via le manuel Epson "Server Direct Print" (Version
 * 2.00) : l'imprimante POST un formulaire `application/x-www-form-urlencoded`.
 * `ConnectionType=GetRequest` = elle demande son travail, on répond en XML
 * `<PrintRequestInfo>` (ou 200 vide si rien) ; `ConnectionType=SetResponse`
 * = elle rapporte le résultat des jobs reçus, simplement accusé réception
 * (même tolérance aux échecs silencieux que le reste du circuit
 * d'impression — un ticket non confirmé n'est jamais réessayé activement,
 * cohérent avec `ticket_imprime_le` marqué dès l'envoi).
 */
const TAILLE_MAX_CORPS = 64 * 1024;
const XML_CONTENT_TYPE = "text/xml; charset=utf-8";
const TIMEOUT_JOB_MS = 10_000;

function reponseVide(): NextResponse {
  return new NextResponse(null, { status: 200, headers: { "Content-Type": XML_CONTENT_TYPE } });
}

function construireJob(id: string, xml: string): string {
  return `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>${TIMEOUT_JOB_MS}</timeout><printjobid>${id}</printjobid></Parameter><PrintData>${xml}</PrintData></ePOSPrint>`;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const imprimante = await trouverImprimantePourJetonDirectPrint(token);
    if (!imprimante) {
      return new NextResponse(null, { status: 404 });
    }

    if (Number(request.headers.get("content-length") ?? "0") > TAILLE_MAX_CORPS) {
      return new NextResponse(null, { status: 400 });
    }
    const corps = await request.text();
    if (corps.length > TAILLE_MAX_CORPS) {
      return new NextResponse(null, { status: 400 });
    }
    const formulaire = new URLSearchParams(corps);
    const typeConnexion = formulaire.get("ConnectionType");

    if (typeConnexion !== "GetRequest") {
      // SetResponse (résultat des jobs) ou tout autre type (notification de
      // statut) : accusé réception, rien de plus à faire.
      return reponseVide();
    }

    const commandes = await listerCommandesDuJourAImprimer();
    if (commandes.length === 0) {
      return reponseVide();
    }

    const jobs = commandes
      .map((commande) => [
        construireJob(`${commande.id}-client`, construireTicketClientXml(commande, null)),
        construireJob(`${commande.id}-cuisine`, construireBonCuisineXml(commande)),
      ])
      .flat()
      .join("");

    await Promise.all(commandes.map((commande) => marquerTicketImprime(commande.id)));

    const xml = `<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="2.00">${jobs}</PrintRequestInfo>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": XML_CONTENT_TYPE } });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
