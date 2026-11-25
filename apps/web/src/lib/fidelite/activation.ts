import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { compterTamponsDisponibles } from "./tampons";
import { progressionTampons } from "./regles";
import { normaliserTelephone } from "@/lib/telephone";
import { demanderConfirmationEmail } from "./email-confirme";

/**
 * Page "voir mes tampons" atteinte après livraison (redirection du scan QR
 * une fois la commande finalisée, cf. `/livreur/scan/[code]`). Le QR est
 * imprimé sur un ticket qui reste agrafé au sachet jusqu'à la livraison —
 * n'importe qui pourrait physiquement le scanner, pas seulement le client
 * (quelqu'un d'autre qui ramasse le reçu, par exemple). Jamais de donnée
 * personnelle (prénom, tampons) révélée sur la seule foi du QR : le
 * scanneur doit d'abord prouver qu'il connaît le numéro de téléphone
 * renseigné à la commande — demande explicite du patron, 2026-10-21. Ce
 * n'est qu'une fois ce numéro vérifié que l'email (s'il manque) peut être
 * demandé pour débloquer l'affichage.
 */
export interface ActivationFidelite {
  prenom: string | null;
  /** Vrai seulement si l'email est CONFIRMÉ (lien cliqué) : sinon le compte n'est pas activé et rien n'est affiché. */
  emailConnu: boolean;
  /** Un email de confirmation vient d'être envoyé (jamais le contenu de la fiche). */
  confirmationEnvoyee?: boolean;
  tamponsAffiches: number;
  recompenseDisponible: boolean;
}

/** Jamais exportée telle quelle : uniquement appelée après vérification du téléphone. */
async function chargerDetails(telephone: string): Promise<ActivationFidelite> {
  const supabase = createServiceSupabaseClient();
  const { data: client } = await supabase
    .from("clients")
    .select("email, email_confirme_le, prenom, montant_cumule")
    .eq("telephone", telephone)
    .maybeSingle();
  const confirme = !!client?.email && !!client.email_confirme_le;
  // Tant que le compte n'est pas activé, aucun solde n'est révélé, même à qui détient le ticket et connaît le numéro.
  if (!confirme) {
    return { prenom: client?.prenom ?? null, emailConnu: false, tamponsAffiches: 0, recompenseDisponible: false };
  }
  const solde = await compterTamponsDisponibles(supabase, telephone);
  return {
    prenom: client?.prenom ?? null,
    emailConnu: true,
    tamponsAffiches: progressionTampons(client?.montant_cumule ?? 0, solde.nombre),
    recompenseDisponible: solde.nombre > 0,
  };
}

/** Téléphone attendu pour ce QR (livraison ou ticket de comptoir) — jamais renvoyé au client, uniquement comparé côté serveur. */
async function trouverTelephoneAttendu(qrCode: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data: livraison } = await supabase.from("livraisons").select("commande_id").eq("qr_code", qrCode).maybeSingle();
  // Ticket de comptoir (sur place / à emporter) : le code du QR est l'identifiant de la commande elle-même.
  const idCommande = livraison?.commande_id ?? (/^[0-9a-f-]{36}$/i.test(qrCode) ? qrCode : null);
  if (!idCommande) return null;
  const { data: commande } = await supabase
    .from("commandes")
    .select("client_telephone")
    .eq("id", idCommande)
    .maybeSingle();
  return commande?.client_telephone ?? null;
}

/** Un QR valide existe-t-il pour ce code — sans rien révéler sur la commande (juste pour décider d'afficher le formulaire ou un message d'erreur). */
export async function codeLivraisonExiste(qrCode: string): Promise<boolean> {
  return (await trouverTelephoneAttendu(qrCode)) !== null;
}

export async function verifierTelephoneParQrLivraison(qrCode: string, telephoneSaisi: string): Promise<ActivationFidelite | null> {
  const telephoneAttendu = await trouverTelephoneAttendu(qrCode);
  if (!telephoneAttendu) return null;
  const telephoneNormalise = normaliserTelephone(telephoneSaisi);
  if (!telephoneNormalise || telephoneNormalise !== telephoneAttendu) return null;
  return chargerDetails(telephoneNormalise);
}

/**
 * Envoie le lien de confirmation de l'email saisi — revérifie le téléphone ici aussi (jamais de
 * confiance dans un appel direct à cette route sans repasser par l'étape
 * précédente), et jamais pour un compte déjà activé.
 */
export async function activerEmailParQrLivraison(
  qrCode: string,
  telephoneSaisi: string,
  email: string,
  accepteOffres: boolean = false
): Promise<ActivationFidelite> {
  const telephoneAttendu = await trouverTelephoneAttendu(qrCode);
  if (!telephoneAttendu) throw new Error("Lien invalide.");
  const telephoneNormalise = normaliserTelephone(telephoneSaisi);
  if (!telephoneNormalise || telephoneNormalise !== telephoneAttendu) throw new Error("Numéro incorrect.");

  // Jamais d'écriture directe de l'email ici : on envoie un lien de confirmation, et l'email n'est enregistré
  // (compte activé) que quand le client clique dessus — preuve qu'il possède bien cette boîte mail.
  const envoi = await demanderConfirmationEmail(telephoneNormalise, email, accepteOffres);
  if (!envoi.ok) throw new Error(envoi.erreur ?? "Impossible d'envoyer l'email.");

  return { ...(await chargerDetails(telephoneNormalise)), confirmationEnvoyee: true };

}
