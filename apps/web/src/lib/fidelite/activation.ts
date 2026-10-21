import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { compterTamponsDisponibles } from "./tampons";
import { progressionTampons } from "./regles";

/**
 * Page "voir mes tampons" atteinte après livraison (redirection du scan QR
 * une fois la commande finalisée, cf. `/livreur/scan/[code]`) — identifie
 * le client par le QR de SA livraison, jamais en lui redemandant son
 * numéro : il vient de recevoir sa commande, on sait déjà qui il est.
 * Objectif explicite du patron, 2026-10-21 : si l'email n'a pas été
 * recueilli à la commande (facultatif en caisse), c'est le moment de
 * l'obtenir — condition d'accès au solde, pas juste une suggestion.
 */
export interface ActivationFidelite {
  trouve: boolean;
  telephone: string;
  prenom: string | null;
  emailConnu: boolean;
  tamponsAffiches: number;
  recompenseDisponible: boolean;
}

export async function chargerActivationParQrLivraison(qrCode: string): Promise<ActivationFidelite | null> {
  const supabase = createServiceSupabaseClient();

  const { data: livraison } = await supabase.from("livraisons").select("commande_id").eq("qr_code", qrCode).maybeSingle();
  if (!livraison) return null;

  const { data: commande } = await supabase
    .from("commandes")
    .select("client_telephone")
    .eq("id", livraison.commande_id)
    .maybeSingle();
  if (!commande?.client_telephone) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("email, prenom, montant_cumule")
    .eq("telephone", commande.client_telephone)
    .maybeSingle();

  const solde = await compterTamponsDisponibles(supabase, commande.client_telephone);

  return {
    trouve: true,
    telephone: commande.client_telephone,
    prenom: client?.prenom ?? null,
    emailConnu: !!client?.email,
    tamponsAffiches: progressionTampons(client?.montant_cumule ?? 0, solde.nombre),
    recompenseDisponible: solde.nombre > 0,
  };
}

/**
 * Enregistre l'email saisi sur cette page — uniquement s'il n'y en a pas
 * déjà un (jamais d'écrasement, même via ce lien à usage non vérifié).
 */
export async function activerEmailParQrLivraison(qrCode: string, email: string): Promise<ActivationFidelite> {
  const supabase = createServiceSupabaseClient();

  const { data: livraison } = await supabase.from("livraisons").select("commande_id").eq("qr_code", qrCode).maybeSingle();
  if (!livraison) throw new Error("Lien invalide.");

  const { data: commande } = await supabase
    .from("commandes")
    .select("client_telephone")
    .eq("id", livraison.commande_id)
    .maybeSingle();
  if (!commande?.client_telephone) throw new Error("Lien invalide.");

  const { data: client } = await supabase
    .from("clients")
    .select("email")
    .eq("telephone", commande.client_telephone)
    .maybeSingle();
  if (client?.email) throw new Error("Un email est déjà enregistré pour ce numéro.");

  const { error } = await supabase.from("clients").update({ email }).eq("telephone", commande.client_telephone);
  if (error) {
    throw new Error(`Impossible d'enregistrer l'email : ${error.message}`);
  }

  const activation = await chargerActivationParQrLivraison(qrCode);
  if (!activation) throw new Error("Lien invalide.");
  return activation;
}
