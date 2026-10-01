import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Canal, ModePaiement } from "@3sauces/supabase";
import type { LigneCommande } from "./types";

export interface CommandeAModifier {
  id: string;
  numero: number;
  canal: Canal;
  nom: string;
  prenom: string;
  telephone: string;
  adresse: string | null;
  zone: string | null;
  creneauHeure: string;
  modePaiement: ModePaiement;
  lignes: LigneCommande[];
  /** `null` = commande d'origine publique (site) — seule éligible à la remise de lancement, y compris après modification ici. */
  commandePar: string | null;
}

/**
 * Charge une commande pour modification depuis /caisse (réutilise le même
 * configurateur que la prise de commande). Volontairement restreint aux
 * commandes encore "en_attente" (au-delà, la préparation a commencé, ça se
 * gère de vive voix) et jamais si une récompense fidélité a déjà été
 * consommée dessus (trop risqué à reverser/réappliquer automatiquement —
 * annuler et recréer dans ce cas précis). Retourne `null` avec un message
 * d'erreur explicite plutôt que de bloquer silencieusement.
 */
export async function chargerCommandePourModification(
  commandeId: string
): Promise<{ commande: CommandeAModifier | null; erreur: string | null }> {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("commandes")
    .select(
      "id, numero, canal, statut, contenu, nom_livraison, prenom, client_telephone, adresse_livraison, zone_livraison, heure_souhaitee, mode_paiement, recompense_appliquee, commande_par"
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (error || !data) {
    return { commande: null, erreur: "Commande introuvable." };
  }
  if (data.statut !== "en_attente") {
    return { commande: null, erreur: 'Seules les commandes encore "En attente" peuvent être modifiées.' };
  }
  if (data.recompense_appliquee) {
    return {
      commande: null,
      erreur:
        "Cette commande a utilisé une récompense fidélité et ne peut pas être modifiée ici — annule-la et recrée-la.",
    };
  }
  if (!data.mode_paiement) {
    return { commande: null, erreur: "Commande invalide (mode de paiement manquant)." };
  }

  const creneauHeure = data.heure_souhaitee
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Indian/Mayotte",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.heure_souhaitee))
    : "";

  // `nom_livraison` reste "Prénom Nom" concaténé (inchangé pour l'impression) ;
  // on retire le préfixe prénom pour reconstituer le seul nom de famille dans
  // le formulaire. Commandes d'avant cette colonne (sans prenom) : tout le
  // texte reste dans le champ "nom", prénom vide — à compléter manuellement.
  const prenom = data.prenom ?? "";
  const nomComplet = data.nom_livraison ?? "";
  const nom = prenom && nomComplet.startsWith(prenom) ? nomComplet.slice(prenom.length).trim() : nomComplet;

  return {
    commande: {
      id: data.id,
      numero: data.numero,
      canal: data.canal,
      nom,
      prenom,
      telephone: data.client_telephone ?? "",
      adresse: data.adresse_livraison,
      zone: data.zone_livraison,
      creneauHeure,
      modePaiement: data.mode_paiement,
      lignes: Array.isArray(data.contenu) ? (data.contenu as LigneCommande[]) : [],
      commandePar: data.commande_par,
    },
    erreur: null,
  };
}
