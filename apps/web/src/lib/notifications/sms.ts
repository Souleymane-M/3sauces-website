import "server-only";

/**
 * Envoi de SMS libres via l'API Messages de Twilio. Nécessite un numéro
 * Twilio dédié à l'envoi (capacité SMS), configuré via `TWILIO_PHONE_NUMBER`.
 *
 * Toujours "best effort" : un échec d'envoi (numéro non configuré, panne
 * Twilio) ne doit jamais faire échouer le traitement d'une commande ou d'un
 * paiement, seulement être journalisé.
 */
export async function envoyerSms(destinataire: string, message: string): Promise<{ ok: boolean; erreur?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const numeroExpediteur = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !numeroExpediteur) {
    return { ok: false, erreur: "TWILIO_PHONE_NUMBER non configuré." };
  }

  try {
    const autorisation = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
    const reponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: autorisation,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: numeroExpediteur, To: destinataire, Body: message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      const erreur = `Twilio ${reponse.status} : ${corps?.message ?? "erreur inconnue"}`;
      console.error("[notifications/sms] échec envoi :", erreur);
      return { ok: false, erreur };
    }
    return { ok: true };
  } catch (erreur) {
    console.error("[notifications/sms] erreur réseau :", erreur);
    return { ok: false, erreur: "Erreur réseau." };
  }
}
