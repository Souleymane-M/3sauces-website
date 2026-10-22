import type { Canal, ModePaiementCommande } from "@3sauces/supabase";
import type { LigneCommande } from "@/lib/caisse/types";

/**
 * Forme minimale nécessaire pour imprimer un ticket client + un bon de
 * préparation — construite soit juste après un "Encaisser" (à partir de
 * l'état déjà connu du panier caisse), soit par le polling des commandes
 * publiques (lib/caisse/nouvelles-commandes.ts). `qrCode` n'est jamais
 * renseigné hors canal "livraison" (pas de livreur à flasher sur place/à
 * emporter).
 */
export interface CommandePourImpression {
  id: string;
  numero: number;
  canal: Canal;
  lignes: LigneCommande[];
  montant: number;
  modePaiement: ModePaiementCommande;
  /** true si le montant est déjà réglé (Stripe, ou encaissé au comptoir) — pour afficher "DÉJÀ PAYÉ" plutôt que "À PAYER" dans le bloc client. */
  dejaPayee: boolean;
  nom: string;
  adresse: string | null;
  heureSouhaitee: string | null;
  creeLe: string;
  qrCode: string | null;
  nbPlats: number;
  /** Téléphone du client, pour le bloc fidélité du reçu — null si non identifié. */
  clientTelephone: string | null;
  /** Nombre de tampons à afficher (0-10+), déjà résolu par l'appelant (jamais calculé dans epos-print.ts, qui reste pur) — null si client non identifié. */
  tamponsAffiches: number | null;
  /** Une récompense (10 tampons) est disponible et pas encore utilisée. */
  recompenseDisponible: boolean;
  /** Message du moment actif à imprimer sur le reçu client — null si inactif/vide. */
  messageDuMoment: string | null;
  /** Vrai = saisie en caisse par un employé, faux = passée par le client sur le site public. */
  origineCaisse: boolean;
  /** Nombre de récompenses (10€ chacune) utilisées sur CETTE commande — jamais confondu avec le solde de tampons restant. */
  tamponsUtilises: number;
  /** Faux = le ticket client (reçu) n'est jamais envoyé à l'impression — choix fait en caisse. Le bon de cuisine n'est jamais concerné. */
  imprimerTicketClient: boolean;
}
