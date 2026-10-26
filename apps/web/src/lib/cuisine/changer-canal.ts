import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

const STATUTS_MODIFIABLES = ["en_attente", "en_preparation", "pret"] as const;
export const CANAUX_CHANGEABLES = ["sur_place", "emporter", "livraison"] as const;
type CanalChangeable = (typeof CANAUX_CHANGEABLES)[number];

interface Entree {
  commandeId: string;
  canal: string;
  adresse?: string;
  zone?: string;
}

/**
 * Change le mode de retrait (sur place / à emporter / livraison) d'une
 * commande de "en attente" à "prête" — des clients se trompent de mode sur
 * le site (demande du patron, 2026-10-26). Ne touche ni au contenu, ni au
 * montant, ni au paiement (une commande déjà payée en ligne reste payée,
 * une commande à payer reste à payer) : seul le mode de retrait change, avec
 * ce qu'il implique (fiche livreur + QR, adresse, zone).
 */
export async function changerCanalCommande({ commandeId, canal, adresse, zone }: Entree): Promise<void> {
  if (!(CANAUX_CHANGEABLES as readonly string[]).includes(canal)) throw new Error("Mode de retrait invalide.");
  const nouveau = canal as CanalChangeable;
  const supabase = createServiceSupabaseClient();

  const { data: commande, error } = await supabase
    .from("commandes")
    .select("id, canal, statut, montant, paiement_statut, mode_paiement, prenom, nom_livraison, heure_souhaitee")
    .eq("id", commandeId)
    .maybeSingle();
  if (error || !commande) throw new Error("Commande introuvable.");
  if (!(STATUTS_MODIFIABLES as readonly string[]).includes(commande.statut)) {
    throw new Error("Le mode de retrait ne peut plus changer (commande déjà enlevée, remise ou annulée).");
  }
  if (commande.canal === nouveau) throw new Error("La commande est déjà dans ce mode de retrait.");
  if (commande.canal === "en_ligne") throw new Error("Ce type de commande ne peut pas être modifié ici.");

  const ancienLivraison = commande.canal === "livraison";
  let adresseFinale: string | null = null;
  let zoneFinale: string | null = null;

  if (nouveau === "livraison") {
    adresseFinale = (adresse ?? "").trim();
    zoneFinale = (zone ?? "").trim();
    if (!adresseFinale) throw new Error("Adresse de livraison requise.");
    if (!(commande.prenom ?? "").trim() && !(commande.nom_livraison ?? "").trim()) {
      throw new Error("Un prénom ou un nom est requis pour une livraison : modifie la commande pour l'ajouter.");
    }
    if (commande.paiement_statut !== "paye" && commande.mode_paiement === "mixte") {
      throw new Error("Paiement mixte impossible sur une livraison non payée : modifie la commande.");
    }
    const [{ data: zones }, { data: parametres }] = await Promise.all([
      supabase.from("zones_livraison").select("commune").eq("actif", true),
      supabase.from("parametres_livraison").select("minimum_commande").eq("id", true).single(),
    ]);
    if (!zoneFinale || !(zones ?? []).some((z) => z.commune === zoneFinale)) throw new Error("Zone de livraison invalide.");
    if (parametres && Number(commande.montant) < Number(parametres.minimum_commande)) {
      throw new Error(`Minimum de commande pour la livraison : ${Number(parametres.minimum_commande).toFixed(2)} €.`);
    }

    // Fiche livreur AVANT la mise à jour (sinon le ticket peut s'imprimer sans QR, cf. #570/#580).
    const { error: erreurLivraison } = await supabase
      .from("livraisons")
      .insert({ commande_id: commandeId, heure_souhaitee: commande.heure_souhaitee });
    if (erreurLivraison && erreurLivraison.code !== "23505") {
      throw new Error("Impossible de créer le suivi de livraison. Réessaie.");
    }
  }

  const { data: maj, error: erreurMaj } = await supabase
    .from("commandes")
    .update({
      canal: nouveau,
      adresse_livraison: adresseFinale,
      zone_livraison: zoneFinale,
      // Le ticket repart à l'impression avec le bon mode.
      ticket_imprime_le: null,
      ticket_remis_le: null,
    })
    .eq("id", commandeId)
    .eq("canal", commande.canal)
    .in("statut", STATUTS_MODIFIABLES)
    .select("id");
  if (erreurMaj || (maj ?? []).length === 0) {
    if (nouveau === "livraison" && !ancienLivraison) await supabase.from("livraisons").delete().eq("commande_id", commandeId);
    throw new Error("La commande vient d'être modifiée ailleurs : recharge et réessaie.");
  }

  if (ancienLivraison && nouveau !== "livraison") {
    const { error: erreurSuppression } = await supabase.from("livraisons").delete().eq("commande_id", commandeId);
    if (erreurSuppression) console.error("[changer-canal] échec suppression suivi livraison :", erreurSuppression.message);
  }
}
