import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

const MODES = ["especes", "cb"] as const;
type Mode = (typeof MODES)[number];

/**
 * Corrige le mode d'un paiement déjà validé (espèces <-> carte), réservé au
 * patron. Jamais pour un paiement en ligne (Stripe) ni mixte. La correction
 * est tracée (qui, quand, ancien -> nouveau) AVANT d'être appliquée : sans
 * trace enregistrée, rien ne change.
 */
export async function corrigerModePaiement(commandeId: string, nouveau: string, profilId: string): Promise<void> {
  if (!(MODES as readonly string[]).includes(nouveau)) throw new Error("Mode de paiement invalide.");
  const nouveauMode = nouveau as Mode;
  const supabase = createServiceSupabaseClient();

  const { data: commande, error } = await supabase
    .from("commandes")
    .select("id, montant, paiement_statut, mode_paiement")
    .eq("id", commandeId)
    .maybeSingle();
  if (error || !commande) throw new Error("Commande introuvable.");
  if (commande.paiement_statut !== "paye") throw new Error("Seul un paiement déjà validé peut être corrigé ici.");
  if (commande.mode_paiement !== "especes" && commande.mode_paiement !== "cb") {
    throw new Error("Seuls les paiements espèces ou carte se corrigent ici (pas en ligne, pas mixte).");
  }
  if (commande.mode_paiement === nouveauMode) throw new Error("Cette commande est déjà dans ce mode de paiement.");

  const { data: lignes, error: erreurLignes } = await supabase
    .from("paiements")
    .select("id, mode")
    .eq("commande_id", commandeId);
  if (erreurLignes) throw new Error("Lecture des paiements impossible.");
  if ((lignes ?? []).length > 1) throw new Error("Paiement réparti en plusieurs lignes : correction impossible ici.");
  if ((lignes ?? []).some((l) => l.mode !== "especes" && l.mode !== "cb")) {
    throw new Error("Seuls les paiements espèces ou carte se corrigent ici.");
  }

  const { error: erreurTrace } = await supabase
    .from("corrections_paiement")
    .insert({ commande_id: commandeId, ancien_mode: commande.mode_paiement, nouveau_mode: nouveauMode, profil_id: profilId });
  if (erreurTrace) throw new Error("Impossible d'enregistrer la trace de la correction : rien n'a été changé.");

  if ((lignes ?? []).length === 1) {
    const { error: erreurPaiement } = await supabase.from("paiements").update({ mode: nouveauMode }).eq("id", lignes![0].id);
    if (erreurPaiement) throw new Error("Correction du paiement impossible.");
  } else {
    // Ancienne commande sans ligne de paiement : on l'enregistre avec le bon mode.
    const { error: erreurInsertion } = await supabase
      .from("paiements")
      .insert({ commande_id: commandeId, montant: Number(commande.montant), mode: nouveauMode });
    if (erreurInsertion) throw new Error("Correction du paiement impossible.");
  }

  const { error: erreurCommande } = await supabase.from("commandes").update({ mode_paiement: nouveauMode }).eq("id", commandeId);
  if (erreurCommande) throw new Error("Paiement corrigé mais pas la commande : préviens-moi.");
}
