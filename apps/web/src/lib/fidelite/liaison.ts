import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { compterTamponsDisponibles } from "./tampons";

/**
 * Associe un email à un numéro déjà connu (historique de commandes sans
 * email, ex: saisie en caisse) — jamais d'écrasement d'un email déjà
 * présent. Même niveau de confiance que le reste de la fidélité sur le
 * site public (ni SMS ni email de vérification, cf. page /fidelite) :
 * c'est le client qui tape lui-même son propre numéro et email pendant
 * SA commande, pas une tierce partie.
 */
export async function lierEmailAuTelephone(telephone: string, email: string) {
  const supabase = createServiceSupabaseClient();

  const { data: client } = await supabase
    .from("clients")
    .select("email, montant_cumule, nom, prenom")
    .eq("telephone", telephone)
    .maybeSingle();
  if (!client) {
    throw new Error("Numéro introuvable.");
  }
  if (client.email) {
    throw new Error("Un email est déjà associé à ce numéro.");
  }

  const { error } = await supabase.from("clients").update({ email }).eq("telephone", telephone);
  if (error) {
    throw new Error(`Impossible d'associer l'email : ${error.message}`);
  }

  const tampons = await compterTamponsDisponibles(supabase, telephone);

  const { data: derniereLivraison } = await supabase
    .from("commandes")
    .select("adresse_livraison, zone_livraison")
    .eq("client_telephone", telephone)
    .eq("canal", "livraison")
    .not("adresse_livraison", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    telephone,
    tamponsDisponibles: tampons.nombre,
    prochaineExpiration: tampons.prochaineExpiration,
    montantCumule: client.montant_cumule,
    nom: client.nom,
    prenom: client.prenom,
    derniereAdresseLivraison: derniereLivraison?.adresse_livraison ?? null,
    derniereZoneLivraison: derniereLivraison?.zone_livraison ?? null,
  };
}
