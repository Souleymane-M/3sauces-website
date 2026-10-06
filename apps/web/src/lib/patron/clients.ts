import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

export interface ClientAdmin {
  telephone: string;
  nom: string | null;
  prenom: string | null;
  /** Reliquat (< 10€) pas encore converti en tampon. */
  montantCumule: number;
  tamponsDisponibles: number;
  prochaineExpiration: string | null;
  email: string | null;
}

export interface CommandeClientAdmin {
  id: string;
  numero: number;
  canal: string;
  statut: string;
  montant: number;
  creeLe: string;
}

/**
 * Tous les clients fidélité (table `clients`, créée/mise à jour
 * automatiquement par le trigger DB à chaque paiement — jamais insérée à
 * la main pour les colonnes fidélité ; `nom`/`prenom` sont l'exception,
 * écrits directement par le code applicatif à chaque commande, cf.
 * /api/commande et /api/caisse/commandes). Triée par nombre de tampons
 * disponibles décroissant : les clients les plus fidèles en premier.
 *
 * Deux requêtes (clients + tampons disponibles) combinées en mémoire :
 * pas de group-by serveur simple avec le client Supabase JS, et la liste
 * de clients d'un seul restaurant reste petite.
 */
export async function listerClientsAdmin(): Promise<ClientAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const [{ data: clients, error: erreurClients }, { data: tampons, error: erreurTampons }] = await Promise.all([
    supabase.from("clients").select("telephone, nom, prenom, montant_cumule, email"),
    supabase
      .from("fidelite_tampons")
      .select("client_telephone, date_expiration")
      .eq("utilise", false)
      .gt("date_expiration", new Date().toISOString())
      .order("date_expiration", { ascending: true }),
  ]);

  if (erreurClients) {
    throw new Error(`Impossible de charger les clients : ${erreurClients.message}`);
  }
  if (erreurTampons) {
    throw new Error(`Impossible de charger les tampons fidélité : ${erreurTampons.message}`);
  }

  const resumeParTelephone = new Map<string, { nombre: number; prochaineExpiration: string }>();
  for (const t of tampons ?? []) {
    const existant = resumeParTelephone.get(t.client_telephone);
    if (existant) {
      existant.nombre += 1;
    } else {
      resumeParTelephone.set(t.client_telephone, { nombre: 1, prochaineExpiration: t.date_expiration });
    }
  }

  return (clients ?? [])
    .map((c) => {
      const resume = resumeParTelephone.get(c.telephone);
      return {
        telephone: c.telephone,
        nom: c.nom,
        prenom: c.prenom,
        montantCumule: c.montant_cumule,
        tamponsDisponibles: resume?.nombre ?? 0,
        prochaineExpiration: resume?.prochaineExpiration ?? null,
        email: c.email,
      };
    })
    .sort((a, b) => b.tamponsDisponibles - a.tamponsDisponibles || b.montantCumule - a.montantCumule);
}

/** Historique simple des commandes d'un client précis, pour sa fiche sur /patron. */
export async function listerCommandesParClient(telephone: string): Promise<CommandeClientAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("commandes")
    .select("id, numero, canal, statut, montant, created_at")
    .eq("client_telephone", telephone)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Impossible de charger l'historique du client : ${error.message}`);
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    canal: c.canal,
    statut: c.statut,
    montant: c.montant,
    creeLe: c.created_at,
  }));
}

/** Corrige l'identité d'un client (nom/prénom/téléphone) — jamais les colonnes fidélité. */
export async function corrigerClientAdmin({
  telephone,
  nouveauTelephone,
  nom,
  prenom,
  email,
}: {
  telephone: string;
  nouveauTelephone?: string;
  nom?: string;
  prenom?: string;
  /** `undefined` = ne touche pas à l'email ; `null`/chaîne = le remplace (y compris pour l'effacer). */
  email?: string | null;
}): Promise<{ erreur: string | null }> {
  const supabase = createServiceSupabaseClient();

  let telephoneActuel = telephone;
  if (nouveauTelephone && nouveauTelephone !== telephone) {
    const { error } = await supabase.rpc("corriger_telephone_client", {
      ancien: telephone,
      nouveau: nouveauTelephone,
    });
    if (error) {
      return { erreur: error.message };
    }
    telephoneActuel = nouveauTelephone;
  }

  if (nom !== undefined || prenom !== undefined || email !== undefined) {
    const maj: { nom?: string; prenom?: string; email?: string | null } = {};
    if (nom !== undefined) maj.nom = nom;
    if (prenom !== undefined) maj.prenom = prenom;
    if (email !== undefined) maj.email = email;
    const { error } = await supabase.from("clients").update(maj).eq("telephone", telephoneActuel);
    if (error) {
      return { erreur: error.message };
    }
  }

  return { erreur: null };
}
