import "server-only";

/**
 * Appels bruts à l'API SumUp (Cloud API, boîtiers Solo) — jamais utilisés
 * directement en dehors de ce fichier, toujours via lib/patron/terminaux-sumup.ts
 * (jumelage) ou le futur chantier d'encaissement caisse (création de
 * checkout). Credentials en variables d'environnement, jamais exposées au
 * navigateur (ce fichier est `server-only`).
 */
const BASE_URL = "https://api.sumup.com";

function identifiantsRequis() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  if (!apiKey || !merchantCode) {
    throw new Error("SumUp non configuré (SUMUP_API_KEY / SUMUP_MERCHANT_CODE manquants).");
  }
  return { apiKey, merchantCode };
}

async function appelSumUp<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const { apiKey } = identifiantsRequis();
  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    throw new Error(`Erreur SumUp (${reponse.status}) : ${corps || reponse.statusText}`);
  }
  // Certaines réponses (ex: suppression) n'ont pas de corps.
  const texte = await reponse.text();
  return (texte ? JSON.parse(texte) : null) as T;
}

export interface LecteurSumUp {
  id: string;
  name: string;
  status: "unknown" | "processing" | "paired" | "expired";
  device: { identifier: string; model: string };
}

/**
 * Jumelage d'un boîtier Solo : le code à 8-9 caractères est généré SUR
 * l'appareil (Réglages → API → Connecter), valable 5 minutes — cf. guide
 * affiché à l'employé sur /patron. Retourne l'identifiant du lecteur
 * ("rdr_..."), à conserver pour cibler ce boîtier précis ensuite.
 */
export async function jumelerLecteur(pairingCode: string, nom: string): Promise<LecteurSumUp> {
  const { merchantCode } = identifiantsRequis();
  return appelSumUp<LecteurSumUp>(`/v0.1/merchants/${merchantCode}/readers`, {
    method: "POST",
    body: JSON.stringify({ pairing_code: pairingCode, name: nom }),
  });
}

export async function supprimerLecteur(readerId: string): Promise<void> {
  const { merchantCode } = identifiantsRequis();
  await appelSumUp<null>(`/v0.1/merchants/${merchantCode}/readers/${readerId}`, { method: "DELETE" });
}

export async function recupererLecteur(readerId: string): Promise<LecteurSumUp> {
  const { merchantCode } = identifiantsRequis();
  return appelSumUp<LecteurSumUp>(`/v0.1/merchants/${merchantCode}/readers/${readerId}`);
}
