import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { compterTamponsDisponibles } from "./tampons";
import { progressionTampons } from "./regles";
import { normaliserTelephone } from "@/lib/telephone";

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
  emailConnu: boolean;
  tamponsAffiches: number;
  recompenseDisponible: boolean;
}

/** Jamais exportée telle quelle : uniquement appelée après vérification du téléphone. */
async function chargerDetails(telephone: string): Promise<ActivationFidelite> {
  const supabase = createServiceSupabaseClient();
  const { data: client } = await supabase
    .from("clients")
    .select("email, prenom, montant_cumule")
    .eq("telephone", telephone)
    .maybeSingle();
  const solde = await compterTamponsDisponibles(supabase, telephone);
  return {
    prenom: client?.prenom ?? null,
    emailConnu: !!client?.email,
    tamponsAffiches: progressionTampons(client?.montant_cumule ?? 0, solde.nombre),
    recompenseDisponible: solde.nombre > 0,
  };
}

/** Téléphone attendu pour ce QR de livraison — jamais renvoyé au client, uniquement comparé côté serveur. */
async function trouverTelephoneAttendu(qrCode: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data: livraison } = await supabase.from("livraisons").select("commande_id").eq("qr_code", qrCode).maybeSingle();
  if (!livraison) return null;
  const { data: commande } = await supabase
    .from("commandes")
    .select("client_telephone")
    .eq("id", livraison.commande_id)
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
 * Enregistre l'email saisi — revérifie le téléphone ici aussi (jamais de
 * confiance dans un appel direct à cette route sans repasser par l'étape
 * précédente), et uniquement s'il n'y a pas déjà un email (jamais
 * d'écrasement).
 */
export async function activerEmailParQrLivraison(
  qrCode: string,
  telephoneSaisi: string,
  email: string
): Promise<ActivationFidelite> {
  const telephoneAttendu = await trouverTelephoneAttendu(qrCode);
  if (!telephoneAttendu) throw new Error("Lien invalide.");
  const telephoneNormalise = normaliserTelephone(telephoneSaisi);
  if (!telephoneNormalise || telephoneNormalise !== telephoneAttendu) throw new Error("Numéro incorrect.");

  const supabase = createServiceSupabaseClient();
  const { data: client } = await supabase.from("clients").select("email").eq("telephone", telephoneNormalise).maybeSingle();
  if (client?.email) throw new Error("Un email est déjà enregistré pour ce numéro.");

  const { error } = await supabase.from("clients").update({ email }).eq("telephone", telephoneNormalise);
  if (error) {
    throw new Error(`Impossible d'enregistrer l'email : ${error.message}`);
  }

  return chargerDetails(telephoneNormalise);
}
