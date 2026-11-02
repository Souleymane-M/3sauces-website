import type { ModePaiement, ModePaiementCommande } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";
import type { PalierGroupe } from "@/lib/commande-publique/groupe-priorite";

export interface LivraisonAssignee {
  id: string;
  numero: number;
  nom: string;
  adresse: string | null;
  /** Pour appeler le client si l'adresse est introuvable — null si non identifié. */
  clientTelephone: string | null;
  montant: number;
  heureSouhaitee: string | null;
  lignes: LigneCommande[];
  nbPlats: number;
  /** Palier de l'offre "commande groupée" atteint à la soumission, null sinon. */
  palierGroupe: PalierGroupe;
  modePaiement: ModePaiementCommande | null;
  /**
   * Vrai UNIQUEMENT si le paiement en ligne a réellement abouti
   * (`paiement_statut === "paye"`) — jamais déduit du seul `modePaiement
   * === "stripe"`, qui ne reflète que le choix du client au moment de
   * commander, pas si Stripe a confirmé l'encaissement (un paiement en
   * ligne abandonné en cours de route a `modePaiement: "stripe"` mais
   * n'a jamais été réglé). Bug réel constaté le 2026-10-21, commande
   * #455 : un paiement Stripe jamais finalisé affiché comme "déjà payé"
   * un peu partout dans l'app.
   */
  dejaPayee: boolean;
}

/**
 * Livraison imprimée (ticket + QR agrafé) mais pas encore prise par un
 * livreur — pour la liste en direct sur /livreur, qui permet de la
 * prendre en charge directement (sans scanner), en plus du scan déjà
 * existant sur le ticket physique.
 */
export interface LivraisonDisponible extends LivraisonAssignee {
  /** La cuisine n'a pas encore cliqué "Prête" — prise en charge quand même possible, juste un avertissement affiché. */
  pasEncorePrete: boolean;
  /** Ce livreur vient lui-même de relâcher cette livraison (cf. `relacherLivraison`) — ne peut pas la reprendre tout de suite, affichée mais sans bouton "prendre". */
  exclu: boolean;
}

export interface PaiementDeclare {
  mode: ModePaiement;
  montant: number;
  payeur?: string;
}

/**
 * État résolu d'un QR scanné (cf. `lireEtatScan`) — un seul type `union`
 * pour que la page `/livreur/scan/[code]` n'ait jamais à redériver elle-même
 * la logique métier, juste à afficher l'état et proposer l'action qui va
 * avec (ou aucune).
 */
export type EtatScan =
  | { type: "introuvable" }
  | { type: "annulee" }
  // `exclu` : ce livreur vient lui-même de relâcher cette livraison — il ne
  // peut pas la reprendre tout de suite, un collègue ou le comptoir doit le
  // faire (cf. `relacherLivraison`). `pasEncorePrete` : la cuisine n'a pas
  // encore cliqué "Prête" — prise en charge quand même possible (le ticket
  // est déjà agrafé au sachet), juste un avertissement affiché au livreur.
  | { type: "a_prendre"; commandeId: string; livraison: LivraisonAssignee; exclu: boolean; pasEncorePrete: boolean }
  | { type: "a_livrer"; commandeId: string; livraison: LivraisonAssignee }
  | { type: "deja_prise_autre"; numero: number; nomLivreur: string | null }
  | { type: "deja_livree"; numero: number };
