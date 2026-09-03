// Types Supabase écrits à la main d'après le schéma réel (migrations SQL +
// vérification directe des colonnes en base pour `commandes`/`paiements`,
// dont la création d'origine n'est pas versionnée).
//
// TODO: remplacer par `supabase gen types typescript` une fois la CLI Supabase
// connectée au projet distant. En attendant, ce fichier ne couvre que les
// tables réellement utilisées par le code (au fur et à mesure des modules) —
// complète-le si tu ajoutes une requête vers une table absente d'ici.

export type Role = "employe" | "livreur" | "patron";

export type Categorie =
  | "menu_special"
  | "snacking"
  | "grillade"
  | "cuisine_locale"
  | "boisson"
  | "supplement";

export type Canal = "sur_place" | "emporter" | "livraison" | "en_ligne";

// Valeurs confirmées par introspection directe des contraintes CHECK en base
// (`paiements_mode_check`, `commandes_mode_paiement_check`) : seules "cb" et
// "especes" sont acceptées aujourd'hui. À étendre (+ ALTER CONSTRAINT côté DB)
// quand les paiements en ligne (Stripe) seront ajoutés.
export type ModePaiement = "especes" | "cb";

export interface Database {
  public: {
    Tables: {
      profils: {
        Row: {
          id: string;
          nom: string;
          role: Role;
          pin_hash: string | null;
          mot_de_passe_hash: string | null;
          actif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom: string;
          role: Role;
          pin_hash?: string | null;
          mot_de_passe_hash?: string | null;
          actif?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profils"]["Insert"]>;
        Relationships: [];
      };

      produits: {
        Row: {
          id: string;
          nom: string;
          categorie: Categorie;
          prix: number | null;
          description: string | null;
          cout_matiere: number | null;
          canette_incluse: boolean;
          nb_viandes_max: number;
          grammage_kebab_g: number | null;
          actif: boolean;
          est_plat_du_jour: boolean;
          est_desactivable: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["produits"]["Row"]> & {
          nom: string;
          categorie: Categorie;
        };
        Update: Partial<Database["public"]["Tables"]["produits"]["Row"]>;
        Relationships: [];
      };

      viandes: {
        Row: {
          id: string;
          nom: string;
          unite_deduction: "grammes" | "pieces";
          actif: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["viandes"]["Row"]> & {
          nom: string;
          unite_deduction: "grammes" | "pieces";
        };
        Update: Partial<Database["public"]["Tables"]["viandes"]["Row"]>;
        Relationships: [];
      };

      sauces: {
        Row: {
          id: string;
          nom: string;
          actif: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sauces"]["Row"]> & {
          nom: string;
        };
        Update: Partial<Database["public"]["Tables"]["sauces"]["Row"]>;
        Relationships: [];
      };

      articles_stock: {
        Row: {
          id: string;
          nom: string;
          unite_achat: "kg" | "pieces" | "cartons" | "litres";
          unite_deduction: "grammes" | "pieces" | "portions_3" | "portion_standard";
          portion_standard: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["articles_stock"]["Row"]> & {
          nom: string;
          unite_achat: "kg" | "pieces" | "cartons" | "litres";
          unite_deduction: "grammes" | "pieces" | "portions_3" | "portion_standard";
        };
        Update: Partial<Database["public"]["Tables"]["articles_stock"]["Row"]>;
        Relationships: [];
      };

      lots: {
        Row: {
          id: string;
          article_stock_id: string;
          fournisseur_id: string | null;
          quantite_achetee: number;
          unite: string;
          prix_paye: number;
          date_achat: string;
          statut: "actif" | "epuise";
          date_ouverture: string;
          date_cloture: string | null;
          facture_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lots"]["Row"]> & {
          article_stock_id: string;
          quantite_achetee: number;
          unite: string;
          prix_paye: number;
        };
        Update: Partial<Database["public"]["Tables"]["lots"]["Row"]>;
        Relationships: [];
      };

      lot_mouvements: {
        Row: {
          id: string;
          lot_id: string;
          commande_id: string | null;
          quantite_deduite: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lot_mouvements"]["Row"]> & {
          lot_id: string;
          quantite_deduite: number;
        };
        Update: Partial<Database["public"]["Tables"]["lot_mouvements"]["Row"]>;
        Relationships: [];
      };

      clients: {
        Row: {
          telephone: string;
          montant_cumule: number;
          tampons_acquis: number;
          recompense_disponible: boolean;
          date_premier_achat_cycle: string | null;
          date_expiration: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          telephone: string;
          montant_cumule?: number;
          recompense_disponible?: boolean;
          date_premier_achat_cycle?: string | null;
          date_expiration?: string | null;
          email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };

      fidelite_mouvements: {
        Row: {
          id: string;
          client_telephone: string;
          type: "accumulation" | "recompense_disponible" | "recompense_utilisee" | "expiration";
          montant: number | null;
          commande_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["fidelite_mouvements"]["Row"]> & {
          client_telephone: string;
          type: "accumulation" | "recompense_disponible" | "recompense_utilisee" | "expiration";
        };
        Update: Partial<Database["public"]["Tables"]["fidelite_mouvements"]["Row"]>;
        Relationships: [];
      };

      commandes: {
        Row: {
          id: string;
          canal: Canal;
          session_table_id: string | null;
          contenu: unknown;
          montant: number;
          statut: string;
          paiement_statut: "non_paye" | "paye" | "remboursee" | string;
          mode_paiement: ModePaiement | null;
          zone_livraison: string | null;
          created_at: string;
          client_telephone: string | null;
          commande_par: string | null;
          cout_matiere_total: number | null;
          recompense_appliquee: boolean;
          nom_livraison: string | null;
          adresse_livraison: string | null;
          heure_souhaitee: string | null;
        };
        Insert: {
          id?: string;
          canal: Canal;
          session_table_id?: string | null;
          contenu: unknown;
          montant: number;
          statut?: string;
          paiement_statut?: "non_paye" | "paye" | "remboursee" | string;
          mode_paiement?: ModePaiement | null;
          zone_livraison?: string | null;
          client_telephone?: string | null;
          commande_par?: string | null;
          cout_matiere_total?: number | null;
          recompense_appliquee?: boolean;
          nom_livraison?: string | null;
          adresse_livraison?: string | null;
          heure_souhaitee?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["commandes"]["Insert"]>;
        Relationships: [];
      };

      paiements: {
        Row: {
          id: string;
          session_table_id: string | null;
          commande_id: string | null;
          montant: number;
          mode: ModePaiement;
          stripe_payment_id: string | null;
          sumup_transaction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_table_id?: string | null;
          commande_id?: string | null;
          montant: number;
          mode: ModePaiement;
          stripe_payment_id?: string | null;
          sumup_transaction_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["paiements"]["Insert"]>;
        Relationships: [];
      };

      parametres_livraison: {
        Row: {
          id: boolean;
          heure_debut: string; // "HH:MM:SS"
          heure_fin: string;
          minimum_commande: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          heure_debut?: string;
          heure_fin?: string;
          minimum_commande?: number;
        };
        Update: Partial<Database["public"]["Tables"]["parametres_livraison"]["Insert"]>;
        Relationships: [];
      };

      zones_livraison: {
        Row: {
          id: string;
          commune: string;
          actif: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          commune: string;
          actif?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["zones_livraison"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
