import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { CommandeAdmin, StatutCommandePublique } from "./types";
import type { LigneCommande } from "@/lib/caisse/types";

export const STATUTS_COMMANDE_PUBLIQUE: StatutCommandePublique[] = ["recue", "en_preparation", "livree"];

/**
 * Commandes du site public pour la vue admin (Page 3).
 *
 * On distingue une commande "site public" d'une commande caisse via
 * `heure_souhaitee is not null` : seule l'API `/api/commande` renseigne ce
 * champ (la caisse ne le fait jamais), donc c'est un filtre fiable sans
 * ajouter de colonne dédiée pour ce MVP.
 */
export async function listerCommandesAdmin(): Promise<CommandeAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select(
      "id, canal, statut, montant, mode_paiement, nom_livraison, client_telephone, adresse_livraison, zone_livraison, heure_souhaitee, contenu, created_at"
    )
    .not("heure_souhaitee", "is", null)
    .order("heure_souhaitee", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    canal: c.canal as CommandeAdmin["canal"],
    statut: (STATUTS_COMMANDE_PUBLIQUE as string[]).includes(c.statut)
      ? (c.statut as StatutCommandePublique)
      : "recue",
    montant: c.montant,
    modePaiement: c.mode_paiement,
    nom: c.nom_livraison,
    telephone: c.client_telephone,
    adresse: c.adresse_livraison,
    zone: c.zone_livraison,
    heureSouhaitee: c.heure_souhaitee as string,
    creeLe: c.created_at,
    lignes: (Array.isArray(c.contenu) ? (c.contenu as LigneCommande[]) : []).map((l) => ({
      produitId: l.produitId,
      nom: l.nom,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      viandes: l.viandes,
      sauces: l.sauces ?? [],
    })),
  }));
}

export async function mettreAJourStatutCommande(id: string, statut: StatutCommandePublique): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("commandes").update({ statut }).eq("id", id);
  if (error) {
    throw new Error(`Impossible de mettre à jour le statut : ${error.message}`);
  }
}
