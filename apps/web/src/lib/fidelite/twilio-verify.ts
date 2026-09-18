import "server-only";

// Envoi/vérification de code OTP via l'API REST Twilio Verify — appel
// fetch direct (Basic Auth), pas besoin du SDK `twilio` pour ces 2 appels.
// Utilisé UNIQUEMENT pour vérifier qu'un client consultant/utilisant sa
// fidélité en ligne est bien le titulaire du numéro — jamais requis pour
// passer une commande classique.

type ResultatOtp = { ok: true } | { ok: false; motif: "numero_invalide" | "trop_de_tentatives" | "code_invalide" | "indisponible" };

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !verifyServiceSid) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_VERIFY_SERVICE_SID doivent être définis (.env.local)."
    );
  }
  return { accountSid, authToken, verifyServiceSid };
}

function autorisationBasique(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function mapperErreurTwilio(code: unknown): ResultatOtp {
  switch (code) {
    case 60200:
      return { ok: false, motif: "numero_invalide" };
    case 60203:
    case 60202:
      return { ok: false, motif: "trop_de_tentatives" };
    case 20404:
      return { ok: false, motif: "code_invalide" };
    default:
      return { ok: false, motif: "indisponible" };
  }
}

export async function envoyerCodeVerification(telephone: string): Promise<ResultatOtp> {
  const { accountSid, authToken, verifyServiceSid } = getConfig();
  try {
    const reponse = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: autorisationBasique(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: telephone, Channel: "sms" }),
      signal: AbortSignal.timeout(8000),
    });
    if (reponse.ok) {
      return { ok: true };
    }
    const corps = await reponse.json().catch(() => null);
    console.error("[fidelite/twilio] échec envoi code :", corps?.code, corps?.message);
    return mapperErreurTwilio(corps?.code);
  } catch (erreur) {
    console.error("[fidelite/twilio] erreur réseau envoi code :", erreur);
    return { ok: false, motif: "indisponible" };
  }
}

export async function verifierCodeVerification(telephone: string, code: string): Promise<ResultatOtp> {
  const { accountSid, authToken, verifyServiceSid } = getConfig();
  try {
    const reponse = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: autorisationBasique(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: telephone, Code: code }),
      signal: AbortSignal.timeout(8000),
    });
    const corps = await reponse.json().catch(() => null);
    if (reponse.ok && corps?.status === "approved") {
      return { ok: true };
    }
    console.error("[fidelite/twilio] échec vérification code :", corps?.code, corps?.status, corps?.message);
    return corps?.code ? mapperErreurTwilio(corps.code) : { ok: false, motif: "code_invalide" };
  } catch (erreur) {
    console.error("[fidelite/twilio] erreur réseau vérification code :", erreur);
    return { ok: false, motif: "indisponible" };
  }
}
