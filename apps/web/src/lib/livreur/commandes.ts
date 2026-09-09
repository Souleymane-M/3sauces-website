import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { changerStatutCommande } from "@/lib/cuisine/commandes";
import type { LivraisonAssignee, PaiementDeclare } from "./types";

/**
 * Livraisons remises à CE livreur par la cuisine (étape "Pris par
 * livreur" sur /commandes) et pas encore déclarées comme livrées — deux
 * requêtes + fusion en JS, même style que lib/caisse/nouvelles-commandes.ts.
 */
export async function listerLivraisonsAssignees(livreurId: string): Promise<LivraisonAssignee[]> {
  const supabase = createServiceSupabaseClient();

  const { data: livraisons, error: erreurLivraisons } = await supabase
    .from("livraisons")
    .select("commande_id")
    .eq("livreur_id", livreurId)
    .eq("statut", "en_livraison");

  if (erreurLivraisons) {
    throw new Error(`Impossible de charger les livraisons assignées : ${erreurLivraisons.message}`);
  }
  const idsCommandes = (livraisons ?? []).map((l) => l.commande_id);
  if (idsCommandes.length === 0) {
    return [];
  }

  const { data: commandes, error: erreurCommandes } = await supabase
    .from("commandes")
    .select("id, numero, nom_livraison, adresse_livraison, montant, heure_souhaitee")
    .in("id", idsCommandes)
    .eq("statut", "pris_par_livreur")
    .order("heure_souhaitee", { ascending: true, nullsFirst: false });

  if (erreurCommandes) {
    throw new Error(`Impossible de charger les commandes : ${erreurCommandes.message}`);
  }

  return (commandes ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    montant: c.montant,
    heureSouhaitee: c.heure_souhaitee,
  }));
}

interface DeclarationLivraison {
  commandeId: string;
  livreurId: string;
  paiements: PaiementDeclare[];
}

/**
 * Déclare le ou les paiements récupérés à la livraison. Ne fait jamais
 * confiance au total calculé côté client : revérifié ici avant tout
 * enregistrement. `paiement_statut` passe à "declare" (pas "paye") — la
 * caisse ou le patron doit encore valider manuellement, cf.
 * lib/encaissements-livraison.ts.
 */
export async function declarerLivraison({ commandeId, livreurId, paiements }: DeclarationLivraison): Promise<void> {
  if (paiements.length === 0) {
    throw new Error("Au moins un paiement est requis.");
  }
  for (const p of paiements) {
    if (!Number.isFinite(p.montant) || p.montant <= 0) {
      throw new Error("Montant de paiement invalide.");
    }
  }

  const supabase = createServiceSupabaseClient();

  const { data: commande, error: erreurCommande } = await supabase
    .from("commandes")
    .select("id, montant, canal, statut")
    .eq("id", commandeId)
    .maybeSingle();
  if (erreurCommande || !commande) {
    throw new Error("Commande introuvable.");
  }
  if (commande.canal !== "livraison" || commande.statut !== "pris_par_livreur") {
    throw new Error("Cette commande n'est pas en cours de livraison.");
  }

  const { data: livraison } = await supabase
    .from("livraisons")
    .select("livreur_id")
    .eq("commande_id", commandeId)
    .maybeSingle();
  if (!livraison || livraison.livreur_id !== livreurId) {
    throw new Error("Cette livraison n'est pas assignée à ce livreur.");
  }

  const totalDeclare = Math.round(paiements.reduce((total, p) => total + p.montant, 0) * 100) / 100;
  const totalAttendu = Math.round(commande.montant * 100) / 100;
  if (totalDeclare !== totalAttendu) {
    throw new Error(`Le total déclaré (${totalDeclare.toFixed(2)} €) ne correspond pas au montant dû (${totalAttendu.toFixed(2)} €).`);
  }

  const { error: erreurPaiements } = await supabase.from("paiements").insert(
    paiements.map((p) => ({
      commande_id: commandeId,
      montant: p.montant,
      mode: p.mode,
      declare_par_livreur_id: livreurId,
      payeur: p.payeur ?? null,
    }))
  );
  if (erreurPaiements) {
    throw new Error(`Impossible d'enregistrer les paiements : ${erreurPaiements.message}`);
  }

  const { error: erreurStatutPaiement } = await supabase
    .from("commandes")
    .update({ paiement_statut: "declare" })
    .eq("id", commandeId);
  if (erreurStatutPaiement) {
    console.error("[livreur/commandes] échec passage à 'declare' :", erreurStatutPaiement.message);
  }

  await changerStatutCommande({ commandeId, statut: "livre", profilId: livreurId });
}
