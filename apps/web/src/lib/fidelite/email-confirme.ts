import { MONTANT_RECOMPENSE } from "@/lib/fidelite/regles";
import { compterTamponsDisponibles } from "@/lib/fidelite/tampons";
import "server-only";
import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { envoyerEmail } from "@/lib/notifications/email";
import { construireEmailClientHtml } from "@/lib/notifications/template";

/**
 * Confirmation de l'email d'un client (demande du patron, 2026-11-25) : le compte fidélité n'est « activé » — donc les
 * récompenses utilisables, sur le site comme en caisse — qu'une fois que le client a cliqué sur le lien reçu par
 * email. Les points de fidélité, eux, s'accumulent toujours. Le client le fait lui-même, à son rythme (jamais au comptoir).
 */

const URL_SITE = "https://3sauces.fr";
const VALIDITE_MS = 48 * 60 * 60 * 1000;
const TEXTE_CONSENTEMENT = "Je souhaite recevoir les offres et actualités de 3 Sauces par email. (confirmation de mon compte fidélité)";

function empreinte(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/**
 * Client qui a des points de fidélité (1 point = 10 € payés, ou une récompense déjà gagnée) mais dont le compte n'est pas
 * activé (email absent ou non confirmé) : le ticket client, avec son QR d'activation, doit lui être remis.
 */
export async function compteAActiverAvecPoints(supabase: SupabaseClient, telephone: string): Promise<boolean> {
  const { data } = await supabase.from("clients").select("email, email_confirme_le, montant_cumule").eq("telephone", telephone).maybeSingle();
  if (!data || (data.email && data.email_confirme_le)) return false;
  if (Number(data.montant_cumule) >= MONTANT_RECOMPENSE) return true;
  const { nombre } = await compterTamponsDisponibles(supabase, telephone);
  return nombre > 0;
}

/** Vrai si le client a un email confirmé — condition pour utiliser une récompense. */
export async function emailEstConfirme(supabase: SupabaseClient, telephone: string): Promise<boolean> {
  const { data } = await supabase.from("clients").select("email, email_confirme_le").eq("telephone", telephone).maybeSingle();
  return !!data?.email && !!data.email_confirme_le;
}

/**
 * Envoie (ou renvoie) le lien de confirmation. Refuse si le client a déjà un email CONFIRMÉ : un compte activé ne change
 * jamais d'email par ce chemin. Un lien précédent encore valable pour ce numéro est simplement remplacé.
 */
export async function demanderConfirmationEmail(telephone: string, email: string, accepteOffres = false): Promise<{ ok: boolean; erreur?: string }> {
  const supabase = createServiceSupabaseClient();
  const { data: client } = await supabase.from("clients").select("email, email_confirme_le").eq("telephone", telephone).maybeSingle();
  if (!client) return { ok: false, erreur: "Numéro introuvable." };
  if (client.email && client.email_confirme_le) return { ok: false, erreur: "Ce compte est déjà activé." };

  const jeton = randomBytes(32).toString("base64url");
  // Un seul lien valable à la fois par numéro.
  await supabase.from("confirmations_email").update({ utilise_le: new Date().toISOString() }).eq("telephone", telephone).is("utilise_le", null);
  const { error } = await supabase.from("confirmations_email").insert({
    telephone,
    email,
    jeton_hash: empreinte(jeton),
    accepte_offres: accepteOffres,
    expire_le: new Date(Date.now() + VALIDITE_MS).toISOString(),
  });
  if (error) return { ok: false, erreur: "Impossible de préparer l'email, réessaie." };

  const lien = `${URL_SITE}/fidelite/confirmer?jeton=${jeton}`;
  const envoi = await envoyerEmail(
    email,
    "Confirme ton email pour activer ton compte 3 Sauces",
    construireEmailClientHtml(
      `<p>Bonjour,</p>
<p>Clique sur le bouton ci-dessous pour <strong>confirmer ton email</strong> et activer ton compte fidélité 3 Sauces. Tu pourras alors utiliser tes récompenses, au restaurant comme sur 3sauces.fr.</p>
<p style="font-size:12px;color:#777777;">Ce lien est valable 48 heures. Si tu n'es pas à l'origine de cette demande, ignore simplement cet email : rien ne sera activé.</p>`,
      "Confirmer mon email",
      lien
    )
  );
  if (!envoi.ok) return { ok: false, erreur: "L'email n'a pas pu être envoyé, réessaie dans quelques minutes." };
  return { ok: true };
}

export type ResultatConfirmation = "ok" | "invalide" | "expire" | "deja_active";

/** Valide le lien : enregistre l'email sur la fiche du client et l'active. */
export async function confirmerEmailParJeton(jeton: string): Promise<ResultatConfirmation> {
  if (!jeton || jeton.length < 20) return "invalide";
  const supabase = createServiceSupabaseClient();
  const { data: demande } = await supabase.from("confirmations_email").select("*").eq("jeton_hash", empreinte(jeton)).maybeSingle();
  if (!demande || demande.utilise_le) return "invalide";
  if (new Date(demande.expire_le).getTime() < Date.now()) return "expire";

  const { data: client } = await supabase.from("clients").select("email, email_confirme_le").eq("telephone", demande.telephone).maybeSingle();
  if (!client) return "invalide";
  if (client.email && client.email_confirme_le) return "deja_active";

  const maintenant = new Date().toISOString();
  const { error } = await supabase.from("clients").update({ email: demande.email, email_confirme_le: maintenant }).eq("telephone", demande.telephone);
  if (error) return "invalide";
  await supabase.from("confirmations_email").update({ utilise_le: maintenant }).eq("id", demande.id);

  // Case « offres et actualités » cochée librement par le client : consentement daté et conservé.
  if (demande.accepte_offres) {
    const { data: existant } = await supabase.from("inscriptions_information").select("id").eq("email", demande.email).maybeSingle();
    if (existant) {
      await supabase
        .from("inscriptions_information")
        .update({ accepte_offres: true, consentement_le: maintenant, texte_consentement: TEXTE_CONSENTEMENT, desinscrit_le: null })
        .eq("id", existant.id);
    } else {
      await supabase.from("inscriptions_information").insert({
        email: demande.email,
        accepte_offres: true,
        consentement_le: maintenant,
        texte_consentement: TEXTE_CONSENTEMENT,
        source: "fidelite_confirmation",
      });
    }
  }
  return "ok";
}

/**
 * Pour les commandes (site, caisse) : enregistre un email NON confirmé seulement si la fiche n'en a aucun — jamais
 * d'écrasement. Renvoie vrai si l'email vient d'être posé (le lien de confirmation peut alors lui être envoyé).
 */
export async function poserEmailNonConfirme(supabase: SupabaseClient, telephone: string, email: string): Promise<boolean> {
  const { data } = await supabase.from("clients").update({ email }).eq("telephone", telephone).is("email", null).select("telephone");
  return (data?.length ?? 0) > 0;
}
