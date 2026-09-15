import type { Canal, Categorie, ModePaiement } from "@3sauces/supabase";

/**
 * Sous-ensemble public de `produits` : jamais de cout_matiere / est_desactivable
 * (données internes) envoyés au navigateur d'un client anonyme.
 *
 * Les produits à prix libre (plat du jour, prix = null) sont exclus du menu
 * public — on ne peut pas laisser un visiteur anonyme saisir son propre prix
 * sur un formulaire non authentifié (contrairement à la caisse, tenue par un
 * employé de confiance).
 */
export interface ProduitPublic {
  id: string;
  nom: string;
  categorie: Categorie;
  prix: number;
  description: string | null;
  nbViandesMax: number;
  /** Si renseigné, viande fixe imposée (ex: Menu Collégien = Poulet) : pas de sélecteur de viande. */
  viandeImposee: string | null;
  /** Nombre max de sauces incluses sans supplément dans le configurateur (0 = pas de sauces proposées). */
  nbSaucesIncluses: number;
  /** Si vrai, le configurateur propose des ajouts payants illimités (viande/sauce supplémentaire). */
  autoriseExtras: boolean;
  /** Nombre de saveurs à choisir avant ajout au panier (0 = ajout direct, 1 = choix obligatoire, ex: Canette 33cl). */
  nbSaveursMax: number;
  /** Si vrai, une canette est incluse dans le prix (ex: Tacos, Barquette, Bowl, Menu Étudiant) : le configurateur propose alors le choix de sa saveur. */
  canetteIncluse: boolean;
  /** Si vrai, la salade est incluse dans la recette mais le client doit choisir explicitement de la garder ou non (ex: Barquettes). */
  saladeIncluse: boolean;
  /** Si renseigné, le configurateur propose une case "+ Salade (X€)" facultative (ex: Tacos, Tacos Bowl). Null = non proposée. */
  saladePrixOption: number | null;
  /** Si vrai, le configurateur propose un choix gratuit obligatoire parmi les accompagnements (ex: Plats du jour) — jamais la "Salade" elle-même, incluse automatiquement sans choix quand elle fait partie de la recette. */
  accompagnementInclus: boolean;
  /** Accompagnements réellement disponibles aujourd'hui parmi la liste (configuré depuis /patron) — n'a de sens que si `accompagnementInclus` est vrai. */
  accompagnementsDisponibles: string[];
}

/**
 * Sous-ensemble des champs de `ProduitPublic` réellement utilisés par les
 * configurateurs (ViandeModalPublique, SaveurModalPublique,
 * QuantiteModalPublique) — `prix` y est nullable pour permettre la
 * réutilisation telle quelle de ces mêmes fenêtres à la caisse (produits à
 * prix libre du jour, ex: "Plat du jour"), jamais le cas côté site public
 * (déjà exclus de `listerProduitsPublics`). `ProduitPublic` (prix non
 * nullable) satisfait ce type sans aucune adaptation.
 */
export type ProduitConfigurable = Omit<ProduitPublic, "prix"> & { prix: number | null };

export interface ViandePublique {
  id: string;
  nom: string;
}

export interface SaucePublique {
  id: string;
  nom: string;
}

export interface SaveurPublique {
  id: string;
  nom: string;
}

/**
 * Produits "supplément" utilisés à l'intérieur du configurateur
 * Tacos/Barquette/Bowl (viande et sauce en plus, avec supplément de prix),
 * jamais affichés comme catégorie autonome sur la page principale — cf.
 * commande-publique-app.tsx qui filtre `categorie === "supplement"`.
 */
export const NOM_PRODUIT_VIANDE_SUPPLEMENTAIRE = "Viande supplémentaire";
export const NOM_PRODUIT_SAUCE_SUPPLEMENTAIRE = "Sauce supplémentaire";
export const NOM_PRODUIT_SALADE_SUPPLEMENTAIRE = "Salade supplémentaire";

export interface ParametresLivraisonPublic {
  heureDebut: string; // "HH:MM:SS"
  heureFin: string;
  minimumCommande: number;
  zonesActives: string[]; // communes autorisées, ex: ["Dembéni"]
  siteOuvert: boolean;
}

export interface LigneCommandePubliquePayload {
  produitId: string;
  quantite: number;
  viandes: string[];
  sauces: string[];
  saveurs: string[];
  /** Saveur choisie pour la canette incluse dans la formule (Tacos/Barquette/Bowl/Menu Étudiant), null si sans objet. */
  boissonIncluse: string | null;
  /** Choix explicite "garder la salade" (true/false) sur un produit à salade incluse obligatoire, null si sans objet. */
  saladeIncluse: boolean | null;
  /** Accompagnements gratuits choisis parmi la liste (ex: Plat du jour), tableau vide si sans objet — jusqu'à 2 si combinables, exactement 1 si exclusif. */
  accompagnementsInclus: string[];
  /** Nom optionnel du convive ("Pour Rachid"), porté par toutes les lignes d'un même plat en mode groupé, null en mode simple. */
  pourQui: string | null;
  /** Index du plat-conteneur en mode "Commande groupée" (0, 1, 2...), null en mode "Commande simple" — décision explicite du client, jamais déduite du contenu. */
  platIndex: number | null;
}

export type CanalPublic = Extract<Canal, "sur_place" | "emporter" | "livraison">;

export interface CreerCommandePubliquePayload {
  canal: CanalPublic;
  nom: string;
  telephone: string;
  modePaiement: ModePaiement;
  lignes: LigneCommandePubliquePayload[];
  // Livraison uniquement :
  adresse?: string;
  zone?: string;
  // Créneau souhaité (heure de passage ou de livraison), "HH:MM".
  creneauHeure: string;
  /** Case "J'accepte les CGV et la politique de confidentialité" — obligatoire, revérifié serveur. */
  consentementCgv: boolean;
}
