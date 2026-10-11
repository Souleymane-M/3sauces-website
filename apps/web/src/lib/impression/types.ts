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
}

export interface ConfigImprimante {
  adresseIp: string;
  port: number;
  /** Adresse du relais local (ex: "https://192.168.x.x:8099") qui contourne le blocage CORS des imprimantes Epson — null = tentative directe (cf. epos-print.ts). */
  relaisUrl: string | null;
}

export type ResultatImpression = { ok: true } | { ok: false; erreur: string };
