import type { Canal, ModePaiement } from "@3sauces/supabase";
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
  modePaiement: ModePaiement;
  nom: string;
  adresse: string | null;
  heureSouhaitee: string | null;
  creeLe: string;
  qrCode: string | null;
}

export interface ConfigImprimante {
  adresseIp: string;
  port: number;
}

export type ResultatImpression = { ok: true } | { ok: false; erreur: string };
