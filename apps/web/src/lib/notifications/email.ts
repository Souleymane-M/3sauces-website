import "server-only";

/**
 * Envoi d'email transactionnel via l'API REST Resend — appel fetch direct
 * (comme Twilio Verify), pas besoin du SDK `resend` pour un seul type
 * d'appel. Toujours "best effort" : un échec (domaine non vérifié, panne
 * Resend) ne doit jamais faire échouer le traitement d'une commande ou
 * d'un paiement, seulement être journalisé.
 *
 * `EMAIL_EXPEDITEUR` doit être une adresse sur un domaine vérifié dans
 * Resend (ex: commandes@3sauces.fr) — sans domaine vérifié, Resend
 * n'autorise l'envoi qu'à l'adresse du compte, ce qui rendrait la
 * notification au client impossible.
 */
export async function envoyerEmail(
  destinataire: string,
  sujet: string,
  html: string,
  /** Adresse où atterrit une réponse du destinataire — ex: la boîte Gmail déjà utilisée par le patron, jamais `EMAIL_EXPEDITEUR` qui n'est pas une vraie boîte consultée. */
  replyTo?: string
): Promise<{ ok: boolean; erreur?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;

  if (!apiKey || !expediteur) {
    return { ok: false, erreur: "RESEND_API_KEY ou EMAIL_EXPEDITEUR non configuré." };
  }

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: expediteur,
        to: destinataire,
        subject: sujet,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      const erreur = `Resend ${reponse.status} : ${corps?.message ?? "erreur inconnue"}`;
      console.error("[notifications/email] échec envoi :", erreur);
      return { ok: false, erreur };
    }
    return { ok: true };
  } catch (erreur) {
    console.error("[notifications/email] erreur réseau :", erreur);
    return { ok: false, erreur: "Erreur réseau." };
  }
}
