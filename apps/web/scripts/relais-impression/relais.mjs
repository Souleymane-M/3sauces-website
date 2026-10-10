#!/usr/bin/env node
// Petit relais local pour contourner le blocage CORS des imprimantes Epson
// TM-m30III (leur service ePOS-Print ne renvoie jamais les en-têtes CORS
// nécessaires, et n'offre aucun réglage pour l'activer — vérifié
// exhaustivement le 2026-10-09). Tourne sur un ordinateur toujours allumé
// du réseau du restaurant : le site (3sauces.fr) lui parle à lui (qui
// répond avec les bons en-têtes, contrôlés ici), et lui retransmet la
// requête à l'imprimante en serveur-à-serveur — jamais soumis aux
// restrictions CORS du navigateur.
//
// Depuis le 2026-10-10, ce relais interroge aussi lui-même le site toutes
// les quelques secondes pour trouver les commandes du site public pas
// encore imprimées, et les imprime directement — sans dépendre d'un
// onglet /caisse ou /commandes ouvert quelque part (cf. README.md,
// section "Impression automatique"). Nécessite AUTH_SECRET (même valeur
// que dans apps/web/.env.local) pour s'authentifier.
//
// Lancement : node relais.mjs
// Voir README.md pour la mise en route complète (certificat, démarrage
// automatique au login).

import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8099;
const TIMEOUT_IMPRIMANTE_MS = 8000;
const SITE_URL = process.env.SITE_URL ?? "https://www.3sauces.fr";
const INTERVALLE_POLLING_MS = process.env.INTERVALLE_POLLING_MS ? Number(process.env.INTERVALLE_POLLING_MS) : 8000;

// Liste blanche volontairement stricte : ce relais tourne sur le réseau
// local du restaurant, exposé à tous les appareils de ce réseau — jamais
// de raison qu'un autre site que 3sauces.fr lui parle.
const ORIGINES_AUTORISEES = new Set([
  "https://3sauces.fr",
  "https://www.3sauces.fr",
  ...(process.env.ORIGINES_SUPPLEMENTAIRES ? process.env.ORIGINES_SUPPLEMENTAIRES.split(",") : []),
]);

const agentSansVerifCertificat = new https.Agent({ rejectUnauthorized: false });

function poserEntetesCors(req, res) {
  const origine = req.headers.origin;
  if (origine && ORIGINES_AUTORISEES.has(origine)) {
    res.setHeader("Access-Control-Allow-Origin", origine);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome bloque par défaut une page publique qui parle à une adresse de
  // réseau local ("Private Network Access") sans cette confirmation
  // explicite sur le préflight — impossible à obtenir du firmware Epson,
  // mais ce relais, lui, peut la donner.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

/** Relaie le XML vers l'imprimante en requête serveur-à-serveur (jamais soumise au CORS du navigateur) et renvoie sa vraie réponse. */
function relayerVersImprimante(urlCible, xml) {
  return new Promise((resolve, reject) => {
    let cible;
    try {
      cible = new URL(urlCible);
    } catch {
      reject(new Error("URL imprimante invalide."));
      return;
    }

    const corpsXml = Buffer.from(xml, "utf-8");
    const requete = https.request(
      {
        hostname: cible.hostname,
        port: cible.port || 443,
        path: `${cible.pathname}${cible.search}`,
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
          "Content-Length": corpsXml.length,
        },
        agent: agentSansVerifCertificat,
        timeout: TIMEOUT_IMPRIMANTE_MS,
      },
      (reponseImprimante) => {
        let corps = "";
        reponseImprimante.on("data", (morceau) => {
          corps += morceau;
        });
        reponseImprimante.on("end", () => {
          resolve({ status: reponseImprimante.statusCode ?? 0, corps });
        });
      }
    );
    requete.on("timeout", () => requete.destroy(new Error("Timeout en parlant à l'imprimante.")));
    requete.on("error", reject);
    requete.write(corpsXml);
    requete.end();
  });
}

async function traiterRequete(req, res) {
  poserEntetesCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/print") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, erreur: "Route inconnue." }));
    return;
  }

  let corpsBrut = "";
  req.on("data", (morceau) => {
    corpsBrut += morceau;
  });
  req.on("end", async () => {
    try {
      const { url, xml } = JSON.parse(corpsBrut);
      if (typeof url !== "string" || typeof xml !== "string" || !url || !xml) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, erreur: "`url` et `xml` sont requis." }));
        return;
      }

      const resultat = await relayerVersImprimante(url, xml);
      console.log(`[relais] ${url} -> HTTP ${resultat.status}`);
      console.log(`[relais] corps de la réponse imprimante : ${resultat.corps}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: resultat.status, corps: resultat.corps }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue.";
      console.error("[relais] échec :", message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, erreur: message }));
    }
  });
}

const cheminCertificat = path.join(DOSSIER, "certificat.pem");
const cheminCle = path.join(DOSSIER, "cle-privee.pem");
const certificatPresent = fs.existsSync(cheminCertificat) && fs.existsSync(cheminCle);

const serveur = certificatPresent
  ? https.createServer(
      { cert: fs.readFileSync(cheminCertificat), key: fs.readFileSync(cheminCle) },
      (req, res) => void traiterRequete(req, res)
    )
  : http.createServer((req, res) => void traiterRequete(req, res));

if (!certificatPresent) {
  console.warn(
    "[relais] ATTENTION : aucun certificat trouvé (certificat.pem/cle-privee.pem) — démarrage en HTTP simple. " +
      "3sauces.fr est en HTTPS et refusera de parler à ce relais tant qu'il n'est pas lui aussi en HTTPS. " +
      "Lancez generer-certificat.sh une fois, cf. README.md."
  );
}

serveur.listen(PORT, "0.0.0.0", () => {
  console.log(`[relais] démarré sur le port ${PORT} (${certificatPresent ? "HTTPS" : "HTTP"})`);
});

// --- Impression automatique des commandes du site public --------------
// Le relais s'authentifie lui-même comme un "employé" (même système que
// /caisse, cf. src/lib/auth/session.ts) en se fabriquant son propre jeton
// de session signé avec AUTH_SECRET — jamais besoin de se connecter à la
// main, jamais besoin de modifier quoi que ce soit côté Vercel.
function base64url(buffer) {
  return buffer.toString("base64url");
}

function fabriquerJetonSession(secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const maintenant = Math.floor(Date.now() / 1000);
  const payload = {
    profilId: "00000000-0000-0000-0000-000000000000",
    role: "employe",
    nom: "Relais d'impression",
    iat: maintenant,
    exp: maintenant + 10 * 365 * 24 * 3600,
  };
  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];
  const signature = base64url(crypto.createHmac("sha256", secret).update(segments.join(".")).digest());
  return [...segments, signature].join(".");
}

async function imprimerSiConfiguree(xml, config, etiquette) {
  if (!config) return true;
  try {
    const resultat = await relayerVersImprimante(
      `https://${config.adresseIp}:${config.port}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
      xml
    );
    console.log(`[relais][auto] ${etiquette} -> HTTP ${resultat.status}`);
    return resultat.corps.includes('success="true"');
  } catch (e) {
    console.error(`[relais][auto] échec impression ${etiquette} :`, e instanceof Error ? e.message : e);
    return false;
  }
}

async function cyclePolling(jeton) {
  const reponse = await fetch(`${SITE_URL}/api/relais/commandes-a-imprimer`, {
    headers: { Cookie: `3sauces_session=${jeton}` },
  });
  if (!reponse.ok) {
    console.error(`[relais][auto] échec interrogation du site : HTTP ${reponse.status}`);
    return;
  }
  const data = await reponse.json();
  for (const commande of data.commandes ?? []) {
    console.log(`[relais][auto] impression commande #${commande.numero}...`);
    const okComptoir = await imprimerSiConfiguree(
      commande.clientXml,
      data.imprimantes?.comptoir,
      `#${commande.numero} comptoir`
    );
    const okCuisine = await imprimerSiConfiguree(
      commande.cuisineXml,
      data.imprimantes?.cuisine,
      `#${commande.numero} cuisine`
    );
    if (okComptoir && okCuisine) {
      await fetch(`${SITE_URL}/api/relais/commandes-a-imprimer`, {
        method: "POST",
        headers: { Cookie: `3sauces_session=${jeton}`, "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: commande.id }),
      });
      console.log(`[relais][auto] commande #${commande.numero} marquée imprimée.`);
    } else {
      console.warn(`[relais][auto] commande #${commande.numero} pas marquée imprimée (échec), réessai au prochain cycle.`);
    }
  }
}

// Lu depuis la variable d'environnement AUTH_SECRET, ou depuis un fichier
// local auth-secret.txt (plus simple à mettre en place pour un démarrage
// automatique via launchd, qui n'hérite pas forcément des variables
// d'environnement du Terminal) — voir README.md.
const cheminSecret = path.join(DOSSIER, "auth-secret.txt");
const authSecret = process.env.AUTH_SECRET ?? (fs.existsSync(cheminSecret) ? fs.readFileSync(cheminSecret, "utf-8").trim() : null);

if (!authSecret) {
  console.warn(
    "[relais][auto] AUTH_SECRET introuvable (ni variable d'environnement, ni fichier auth-secret.txt) — " +
      "l'impression automatique des commandes du site public est désactivée. Voir README.md, section \"Impression automatique\"."
  );
} else {
  const jeton = fabriquerJetonSession(authSecret);
  console.log(`[relais][auto] impression automatique activée, vérifie ${SITE_URL} toutes les ${INTERVALLE_POLLING_MS / 1000}s.`);
  setInterval(() => {
    cyclePolling(jeton).catch((e) => console.error("[relais][auto] échec du cycle :", e instanceof Error ? e.message : e));
  }, INTERVALLE_POLLING_MS);
}
