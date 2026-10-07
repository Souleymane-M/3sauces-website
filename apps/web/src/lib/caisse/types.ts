import type { Canal, Categorie, ModePaiement, ModePaiementCommande } from "@3sauces/supabase";
import type { ProduitPublic } from "@/lib/commande-publique/types";

/**
 * Structure applicative stockée dans `commandes.contenu` (JSONB).
 * Un instantané des lignes au moment de la vente : on fige nom/prix/coût pour
 * que l'historique reste exact même si la carte change ensuite.
 */
export interface LigneCommande {
  produitId: string;
  nom: string;
  categorie: Categorie;
  quantite: number;
  prixUnitaire: number;
  coutMatiereUnitaire: number | null;
  viandes: string[];
  /** Sauces incluses (jusqu'à `nb_sauces_incluses` du produit). */
  sauces?: string[];
  /** Saveur choisie pour un produit vendu directement à la saveur (ex: Canette 33cl). */
  saveurs?: string[];
  /** Saveur de la canette incluse dans une formule (Tacos/Barquette/Bowl/Menu Étudiant). */
  boissonIncluse?: string | null;
  /** Client a explicitement refusé la canette incluse (-1,50€) — jamais déduit de `boissonIncluse === null`. */
  sansBoisson?: boolean;
  canetteIncluse: boolean;
  /** Choix explicite "garder la salade" sur un produit à salade incluse obligatoire (ex: Barquette), null si sans objet. */
  saladeIncluse?: boolean | null;
  /** Accompagnements gratuits choisis parmi la liste (ex: Plat du jour), tableau vide si sans objet. */
  accompagnementsInclus?: string[];
  /** Nom optionnel du convive ("Pour Rachid"), porté par toutes les lignes d'un même plat en mode groupé, null en mode simple/comptoir. */
  pourQui?: string | null;
  /** Index du plat-conteneur en mode "Commande groupée" (téléphone), null en mode comptoir/simple. */
  platIndex: number | null;
}

/**
 * Produit caisse : mêmes champs/règles que `ProduitPublic` (configurateur
 * identique au site — viandes, sauces incluses, extras, saveur de boisson,
 * canette incluse), plus les champs internes à la caisse (coût matière,
 * indicateurs plat-du-jour/désactivable). `prix` reste nullable : la caisse,
 * contrairement au site public, vend aussi des produits à prix libre
 * (ex: "Plat du jour", prix saisi chaque jour par l'employé).
 */
export interface ProduitCaisse extends Omit<ProduitPublic, "prix"> {
  prix: number | null;
  coutMatiere: number | null;
  estPlatDuJour: boolean;
  estDesactivable: boolean;
}

export interface ViandeCaisse {
  id: string;
  nom: string;
}

export interface SauceCaisse {
  id: string;
  nom: string;
}

export interface SaveurCaisse {
  id: string;
  nom: string;
}

export interface LigneCommandePayload {
  produitId: string;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  boissonIncluse: string | null;
  sansBoisson?: boolean;
  /** Prix saisi manuellement, uniquement pour un produit à prix libre (plat du jour). */
  prixSaisi?: number;
  saladeIncluse: boolean | null;
  accompagnementsInclus: string[];
  pourQui: string | null;
  platIndex: number | null;
}

export interface CreerCommandePayload {
  canal: Canal;
  modePaiement: ModePaiementCommande;
  /** Détail espèces/carte si modePaiement === "mixte" — ignoré sinon. Les montants doivent sommer exactement au total de la commande, revérifié côté serveur. */
  paiements?: { mode: ModePaiement; montant: number }[];
  lignes: LigneCommandePayload[];
  // Obligatoires pour tous les canaux (comme nom/téléphone sur le site
  // public, cf. /api/commande) ; optionnels ici uniquement pour laisser le
  // serveur renvoyer une erreur 400 propre plutôt qu'un crash si absents.
  clientTelephone?: string;
  nom?: string;
  prenom?: string;
  /** `null` = laissé vide par la caissière pour garder l'email déjà enregistré sur ce numéro. */
  email?: string | null;
  /** Nombre de tampons fidélité (10€ chacun) à utiliser sur cette commande — revérifié intégralement côté serveur (disponibilité réelle, FIFO). */
  nbTampons?: number;
  /** Parfum choisi pour la boisson 2L offerte (palier GROUPE_4) — requis uniquement si ce palier s'applique, revérifié côté serveur. */
  boissonOfferteSaveur?: string;
  // Livraison uniquement (même règles que le site public, cf. /api/commande) :
  adresse?: string;
  zone?: string;
  creneauHeure?: string;
  /** Date de retrait/livraison "YYYY-MM-DD" — absente ou omise = aujourd'hui, jamais de prépaiement exigé ici contrairement au site public. */
  date?: string;
  /** Sur place/à emporter uniquement, pour aujourd'hui : le client est présent et paie tout de suite. Toujours ignoré pour une livraison ou une commande à l'avance (forcément "non_paye"). */
  encaisserMaintenant?: boolean;
}

/**
 * Modification du contenu d'une commande existante encore "en_attente" —
 * mêmes champs que la création, `nbTampons` en moins (jamais togglable via
 * une modification). `canal` peut changer, sauf dans un sens (vers
 * "livraison" depuis un canal déjà payé) — revérifié et bloqué côté
 * serveur, cf. /api/caisse/commandes PATCH.
 */
export interface ModifierCommandePayload extends Omit<CreerCommandePayload, "nbTampons"> {
  commandeId: string;
}
