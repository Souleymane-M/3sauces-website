import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { CommandePourImpression } from "@/lib/impression/types";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";

const SELECT_POUR_IMPRESSION =
  "id, numero, canal, contenu, montant, mode_paiement, paiement_statut, nom_livraison, adresse_livraison, heure_souhaitee, created_at, nb_plats";

function versMinutesDepuisMinuit(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

function heureMayotteEnMinutes(): number {
  const maintenantMayotte = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return maintenantMayotte.getUTCHours() * 60 + maintenantMayotte.getUTCMinutes();
}

async function ajouterQrCodesLivraison(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  commandes: { id: string; canal: string }[]
): Promise<Map<string, string>> {
  const idsLivraison = commandes.filter((c) => c.canal === "livraison").map((c) => c.id);
  const qrCodeParCommandeId = new Map<string, string>();
  if (idsLivraison.length === 0) return qrCodeParCommandeId;

  const { data: livraisons, error } = await supabase
    .from("livraisons")
    .select("commande_id, qr_code")
    .in("commande_id", idsLivraison);
  if (error) {
    throw new Error(`Impossible de charger les QR de livraison : ${error.message}`);
  }
  for (const l of livraisons ?? []) {
    qrCodeParCommandeId.set(l.commande_id, l.qr_code);
  }
  return qrCodeParCommandeId;
}

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

  const { fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(SELECT_POUR_IMPRESSION)
    .is("commande_par", null)
    .gt("created_at", depuis)
    // Même filtre que l'écran cuisine (lib/cuisine/commandes.ts) : un
    // paiement en ligne non confirmé ne s'imprime jamais avant d'être
    // réellement payé.
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    // Une commande à l'avance ne s'imprime pas maintenant : elle est prise
    // en charge par listerCommandesAImprimerDifferees, le jour venu.
    .lt("heure_souhaitee", fin.toISOString())
    // Filet de sécurité contre le double-tirage : si /caisse redémarre avec
    // un curseur ancien (iPad resté fermé), une commande à l'avance déjà
    // imprimée entre-temps via le circuit différé ne doit jamais repasser
    // par ici.
    .is("ticket_imprime_le", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Impossible de charger les nouvelles commandes : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return { commandes: [], curseurSuivant };
  }

  const qrCodeParCommandeId = await ajouterQrCodesLivraison(supabase, commandes);

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
    nbPlats: c.nb_plats,
  }));

  return { commandes: commandesPourImpression, curseurSuivant };
}

/**
 * Commandes à l'avance dont le jour de retrait est arrivé, pas encore
 * imprimées, une fois l'heure d'ouverture atteinte (heure Mayotte).
 * `created_at` antérieur à aujourd'hui est ce qui distingue une vraie
 * commande à l'avance d'une commande du jour même — cette dernière est
 * déjà gérée par `listerNouvellesCommandesPubliques` et ne doit jamais
 * être re-détectée ici.
 */
export async function listerCommandesAImprimerDifferees(heureDebut: string): Promise<CommandePourImpression[]> {
  if (heureMayotteEnMinutes() < versMinutesDepuisMinuit(heureDebut)) {
    return [];
  }

  const supabase = createServiceSupabaseClient();
  const { debut, fin } = plageJourMayotteUtc(dateMayotteIso());

  const { data: commandes, error } = await supabase
    .from("commandes")
    .select(SELECT_POUR_IMPRESSION)
    .is("commande_par", null)
    .gte("heure_souhaitee", debut.toISOString())
    .lt("heure_souhaitee", fin.toISOString())
    .lt("created_at", debut.toISOString())
    .is("ticket_imprime_le", null)
    .or("mode_paiement.neq.stripe,paiement_statut.eq.paye")
    .order("heure_souhaitee", { ascending: true });

  if (error) {
    throw new Error(`Impossible de charger les commandes à imprimer : ${error.message}`);
  }
  if (!commandes || commandes.length === 0) {
    return [];
  }

  const qrCodeParCommandeId = await ajouterQrCodesLivraison(supabase, commandes);

  return commandes.map((c) => ({
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
    nbPlats: c.nb_plats,
  }));
}

export async function marquerTicketImprime(commandeId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("commandes")
    .update({ ticket_imprime_le: new Date().toISOString() })
    .eq("id", commandeId);

  if (error) {
    throw new Error(`Impossible de marquer le ticket comme imprimé : ${error.message}`);
  }
}
