import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Canal, ModePaiementCommande } from "@3sauces/supabase";
import { dateMayotteIso, plageJourMayotteUtc } from "@/lib/commande-publique/creneau";

export interface CaParCanal {
  canal: Canal;
  nbCommandes: number;
  ca: number;
}

export interface MargeBruteJour {
  caJour: number;
  coutMatiereJour: number;
  margeBruteJour: number;
  /** Doit toujours être 0 — règle absolue : jamais de vente sans coût matière associé. */
  commandesSansCout: number;
}

export interface ProduitRentable {
  produitId: string | null;
  nom: string;
  quantiteVendue: number;
  margeTotale: number;
}

export interface RepartitionPaiement {
  mode: ModePaiementCommande;
  montant: number;
  nbCommandes: number;
}

export interface StatistiquesJour {
  caParCanal: CaParCanal[];
  caTotal: number;
  nbCommandesTotal: number;
  margeBrute: MargeBruteJour;
  ticketMoyen: number;
  produitPlusRentable: ProduitRentable | null;
  repartitionPaiement: RepartitionPaiement[];
}

const LIBELLE_MODE: Record<ModePaiementCommande, string> = {
  especes: "Espèces",
  cb: "Carte (comptoir/livreur)",
  stripe: "En ligne (Stripe)",
  mixte: "Mixte (espèces + carte)",
};

export function libelleModePaiementStat(mode: ModePaiementCommande): string {
  return LIBELLE_MODE[mode];
}

/**
 * Statistiques de vente du jour (Mayotte) pour /patron — jusqu'ici
 * uniquement l'espèces/CB physiquement encaissé (v_encaissements_jour,
 * alimentée par la table `paiements`) était affiché, ce qui exclut
 * entièrement les paiements en ligne (Stripe ne crée jamais de ligne dans
 * `paiements`, seulement `commandes.montant` + `paiement_statut = 'paye'`).
 * Ici on repart directement de `commandes`, qui reste la seule source
 * fiable pour TOUT le chiffre d'affaires, quel que soit le mode.
 */
export async function chargerStatistiquesJour(): Promise<StatistiquesJour> {
  const supabase = createServiceSupabaseClient();
  const { debut, fin } = plageJourMayotteUtc(dateMayotteIso());

  const [{ data: commandes, error: erreurCommandes }, { data: margeBrute, error: erreurMarge }, { data: produits, error: erreurProduits }] =
    await Promise.all([
      supabase
        .from("commandes")
        .select("canal, montant, mode_paiement")
        .eq("paiement_statut", "paye")
        .gte("created_at", debut.toISOString())
        .lt("created_at", fin.toISOString()),
      supabase.from("v_marge_brute_jour").select("*").maybeSingle(),
      supabase.from("v_produit_plus_rentable_jour").select("*").limit(1).maybeSingle(),
    ]);

  if (erreurCommandes) {
    throw new Error(`Impossible de charger les commandes du jour : ${erreurCommandes.message}`);
  }
  if (erreurMarge) {
    throw new Error(`Impossible de charger la marge brute du jour : ${erreurMarge.message}`);
  }
  if (erreurProduits) {
    throw new Error(`Impossible de charger le produit le plus rentable : ${erreurProduits.message}`);
  }

  const lignes = commandes ?? [];

  const parCanal = new Map<Canal, { nbCommandes: number; ca: number }>();
  const parMode = new Map<ModePaiementCommande, { nbCommandes: number; montant: number }>();
  for (const c of lignes) {
    const canalActuel = parCanal.get(c.canal) ?? { nbCommandes: 0, ca: 0 };
    canalActuel.nbCommandes += 1;
    canalActuel.ca += c.montant;
    parCanal.set(c.canal, canalActuel);

    if (c.mode_paiement) {
      const modeActuel = parMode.get(c.mode_paiement) ?? { nbCommandes: 0, montant: 0 };
      modeActuel.nbCommandes += 1;
      modeActuel.montant += c.montant;
      parMode.set(c.mode_paiement, modeActuel);
    }
  }

  const caTotal = lignes.reduce((total, c) => total + c.montant, 0);
  const nbCommandesTotal = lignes.length;

  return {
    caParCanal: [...parCanal.entries()].map(([canal, v]) => ({ canal, ...v })),
    caTotal: Math.round(caTotal * 100) / 100,
    nbCommandesTotal,
    margeBrute: {
      caJour: margeBrute?.ca_jour ?? 0,
      coutMatiereJour: margeBrute?.cout_matiere_jour ?? 0,
      margeBruteJour: margeBrute?.marge_brute_jour ?? 0,
      commandesSansCout: margeBrute?.commandes_sans_cout ?? 0,
    },
    ticketMoyen: nbCommandesTotal === 0 ? 0 : Math.round((caTotal / nbCommandesTotal) * 100) / 100,
    produitPlusRentable: produits
      ? {
          produitId: produits.produit_id,
          nom: produits.nom ?? "?",
          quantiteVendue: Number(produits.quantite_vendue),
          margeTotale: Number(produits.marge_totale),
        }
      : null,
    repartitionPaiement: [...parMode.entries()].map(([mode, v]) => ({
      mode,
      montant: Math.round(v.montant * 100) / 100,
      nbCommandes: v.nbCommandes,
    })),
  };
}
