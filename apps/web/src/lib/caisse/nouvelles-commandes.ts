import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { CommandePourImpression } from "@/lib/impression/types";

/**
 * Détecte les commandes reçues depuis le site public (jamais celles prises
 * au comptoir) pour que /caisse les imprime + joue une alerte sonore — cf.
 * caisse-app.tsx. Signal exact : `commande_par` vaut l'id de l'employé pour
 * une commande caisse, `null` pour une commande publique (jamais l'inverse).
 *
 * `curseurSuivant` est l'heure du SERVEUR au moment de la requête, pas
 * `Date.now()` côté iPad : évite tout risque de rater des commandes si
 * l'horloge de l'iPad dérive par rapport à celle de Supabase.
 */
export async function listerNouvellesCommandesPubliques(
  depuis: string | null
): Promise<{ commandes: CommandePourImpression[]; curseurSuivant: string }> {
  const supabase = createServiceSupabaseClient();
  const curseurSuivant = new Date().toISOString();

  if (!depuis) {
    // Premier appel après ouverture de /caisse (aucun curseur persisté) :
    // ne remonte rien pour ne jamais imprimer en rafale l'historique.
    return { commandes: [], curseurSuivant };
  }

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select("id, numero, canal, contenu, montant, mode_paiement, nom_livraison, adresse_livraison, heure_souhaitee, created_at")
    .is("commande_par", null)
    .gt("created_at", depuis)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Impossible de charger les nouvelles commandes : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return { commandes: [], curseurSuivant };
  }

  const idsLivraison = commandes.filter((c) => c.canal === "livraison").map((c) => c.id);
  const qrCodeParCommandeId = new Map<string, string>();

  if (idsLivraison.length > 0) {
    const { data: livraisons, error: erreurLivraisons } = await supabase
      .from("livraisons")
      .select("commande_id, qr_code")
      .in("commande_id", idsLivraison);

    if (erreurLivraisons) {
      throw new Error(`Impossible de charger les QR de livraison : ${erreurLivraisons.message}`);
    }
    for (const l of livraisons ?? []) {
      qrCodeParCommandeId.set(l.commande_id, l.qr_code);
    }
  }

  const commandesPourImpression: CommandePourImpression[] = commandes.map((c) => ({
    id: c.id,
    numero: c.numero,
    canal: c.canal,
    lignes: (c.contenu as LigneCommande[]) ?? [],
    montant: c.montant,
    modePaiement: c.mode_paiement ?? "especes",
    nom: c.nom_livraison ?? "",
    adresse: c.adresse_livraison,
    heureSouhaitee: c.heure_souhaitee,
    creeLe: c.created_at,
    qrCode: qrCodeParCommandeId.get(c.id) ?? null,
  }));

  return { commandes: commandesPourImpression, curseurSuivant };
}
