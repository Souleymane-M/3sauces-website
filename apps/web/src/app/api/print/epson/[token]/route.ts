import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { construireTicketClientXmlBrut, construireBonCuisineXmlBrut } from "@/lib/impression/epos-print";
import { analyserResultats } from "@/lib/impression/epos-response";
import { marquerTicketRemis, marquerDernierTicketRemisImprime, listerCommandesDuJourAImprimer } from "@/lib/caisse/nouvelles-commandes";
import { trouverImprimantePourJetonDirectPrint } from "@/lib/patron/imprimantes";

/**
 * Diagnostic temporaire (2026-10-16, cf. migration debug_print_log) :
 * journalise ce que l'imprimante envoie/reçoit réellement, pour comprendre
 * pourquoi #357/#358 ont été marquées imprimées sans sortir sur papier.
 * Best effort — ne doit jamais faire échouer le vrai flux d'impression.
 */
async function journaliser(connectionType: string, commandeNumero: number | null, corps: string): Promise<void> {
  try {
    const supabase = createServiceSupabaseClient();
    await supabase
      .from("debug_print_log")
      .insert({ connection_type: connectionType, commande_numero: commandeNumero, corps: corps.slice(0, 4000) });
  } catch {
    // Jamais bloquant pour l'impression réelle.
  }
}

/**
 * Là où l'imprimante Epson (fonction "Server Direct Print", activée
 * directement sur l'imprimante — Services → Server Direct Print) vient
 * elle-même chercher son travail toutes les quelques secondes, sans
 * dépendre d'aucun appareil local (Mac/iPad/relais). Jamais de session
 * ici : l'imprimante ne porte pas de cookie, le jeton dans l'URL EST
 * l'authentification — voir `trouverImprimantePourJetonDirectPrint`.
 *
 * Protocole confirmé via le manuel Epson "Server Direct Print". Le format
 * `<printjobid>` et `Version="2.00"` ne sont disponibles qu'à partir du
 * micrologiciel TM-i Ver.4.1 — le nôtre est en 01.39 (vu sur l'écran "État
 * du produit" de l'imprimante), bien en dessous : confirmé le 2026-10-13
 * que l'imprimante ignore silencieusement une requête `Version="2.00"`
 * avec `<printjobid>` (elle répond un `<PrintResponseInfo>` vide, aucune
 * erreur). On reste donc sur `Version="1.00"`, sans `<printjobid>` — une
 * seule commande à la fois par sondage (ses 2 tickets, client + cuisine),
 * pour ne jamais avoir besoin de savoir à quel job un résultat sans id
 * correspond (cf. `marquerDernierTicketRemisImprime`).
 *
 * L'imprimante POST un formulaire `application/x-www-form-urlencoded`.
 * `ConnectionType=GetRequest` = elle demande son travail, on répond en XML
 * `<PrintRequestInfo>` (ou 200 vide si rien) ; `ConnectionType=SetResponse`
 * = elle rapporte le résultat des jobs reçus, simplement accusé réception
 * (même tolérance aux échecs silencieux que le reste du circuit
 * d'impression — un ticket non confirmé est réessayé après 2 minutes,
 * cf. `listerCommandesDuJourAImprimer`).
 */
const TAILLE_MAX_CORPS = 64 * 1024;
const XML_CONTENT_TYPE = "text/xml; charset=utf-8";
const TIMEOUT_JOB_MS = 10_000;

function reponseVide(): NextResponse {
  return new NextResponse(null, { status: 200, headers: { "Content-Type": XML_CONTENT_TYPE } });
}

function construireJob(xml: string): string {
  return `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>${TIMEOUT_JOB_MS}</timeout></Parameter><PrintData>${xml}</PrintData></ePOSPrint>`;
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

    if (typeConnexion === "SetResponse") {
      const fichierReponse = formulaire.get("ResponseFile") ?? "";
      await journaliser("SetResponse", null, fichierReponse);
      // Micrologiciel trop ancien pour renvoyer le `printjobid` dans le
      // résultat (cf. commentaire en tête de fichier) : un succès marque
      // simplement la dernière commande remise comme imprimée — fiable ici
      // puisqu'une seule commande est remise à la fois (voir plus bas).
      const resultats = analyserResultats(fichierReponse);
      if (resultats.some((r) => r.succes)) {
        await marquerDernierTicketRemisImprime();
      }
      return reponseVide();
    }

    if (typeConnexion !== "GetRequest") {
      return reponseVide();
    }

    const [commande] = await listerCommandesDuJourAImprimer();
    if (!commande) {
      return reponseVide();
    }
    await journaliser("GetRequest", commande.numero, `commande #${commande.numero} remise`);

    const jobs = [
      construireJob(construireTicketClientXmlBrut(commande, null)),
      construireJob(construireBonCuisineXmlBrut(commande)),
    ].join("");

    await marquerTicketRemis(commande.id);

    const xml = `<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="1.00">${jobs}</PrintRequestInfo>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": XML_CONTENT_TYPE } });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
