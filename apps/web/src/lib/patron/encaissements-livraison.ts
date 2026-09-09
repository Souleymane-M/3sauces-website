import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LivraisonAEncaisser } from "./encaissements-livraison-types";

/**
 * Une livraison prise au téléphone par la caisse est enregistrée
 * "non_paye" (cf. /api/caisse/commandes) : le client paie le livreur à la
 * remise, pas la caisse à la prise de commande. Cet écran régularise ça au
 * retour du livreur — une fois "Encaissée", le trigger DB
 * `commandes_appliquer_fidelite` (déclenché sur passage à 'paye')
 * accumule/consomme la fidélité au bon moment.
 */
export async function listerLivraisonsAEncaisser(): Promise<LivraisonAEncaisser[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select("id, numero, nom_livraison, adresse_livraison, montant, mode_paiement, created_at")
    .eq("canal", "livraison")
    .neq("paiement_statut", "paye")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les livraisons à encaisser : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    montant: c.montant,
    modePaiement: c.mode_paiement,
    creeLe: c.created_at,
  }));
}

export async function marquerLivraisonEncaissee(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurLecture } = await supabase
    .from("commandes")
    .select("id, canal, paiement_statut, montant, mode_paiement")
    .eq("id", commandeId)
    .maybeSingle();

  if (erreurLecture || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison") {
    throw new Error("Cette commande n'est pas une livraison.");
  }
  if (commande.paiement_statut === "paye") {
    throw new Error("Cette commande est déjà marquée comme encaissée.");
  }

  const { error: erreurMaj } = await supabase
    .from("commandes")
    .update({ paiement_statut: "paye" })
    .eq("id", commandeId);

  if (erreurMaj) {
    throw new Error(`Impossible de marquer la commande encaissée : ${erreurMaj.message}`);
  }

  const { error: erreurPaiement } = await supabase.from("paiements").insert({
    commande_id: commandeId,
    montant: commande.montant,
    mode: commande.mode_paiement ?? "especes",
  });

  if (erreurPaiement) {
    console.error("[encaissements-livraison] échec insertion paiement :", erreurPaiement.message);
  }
}
