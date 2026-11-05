/**
 * Lieux de livraison du site : les trois lieux principaux ont des créneaux fixes (le livreur y passe à
 * heures précises), les villages de la commune gardent une heure libre. Aucun nombre de places limité
 * (décision du patron : on observe d'abord les volumes).
 */

import { filtrerCreneauxLivraison } from "./creneau";

export interface LieuLivraison {
  id: string;
  nom: string;
  /** Créneaux imposés (début de chaque créneau, "HH:MM") ; null = heure libre. */
  creneaux: string[] | null;
  /** Durée d'une fourchette en minutes (créneau affiché « entre 11h00 et 11h30 ») ; null = heure précise. */
  fourchetteMinutes: number | null;
  /** Village : une précision (mairie, CCAS, rue…) est obligatoire. */
  village: boolean;
  /** Lieu unique et sans ambiguïté (fac, lycée) : aucune précision demandée. */
  sansPrecision?: boolean;
}

export const LIEUX_PRINCIPAUX: LieuLivraison[] = [
  {
    id: "universite",
    nom: "Université de Mayotte",
    creneaux: ["10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"],
    fourchetteMinutes: 30,
    village: false,
    sansPrecision: true,
  },
  { id: "lycee", nom: "Lycée de Dembéni", creneaux: ["10:30", "11:20", "12:20"], fourchetteMinutes: null, village: false, sansPrecision: true },
  { id: "technopole", nom: "Technopole", creneaux: ["12:00", "12:30"], fourchetteMinutes: null, village: false },
];

export const VILLAGES: LieuLivraison[] = ["Dembéni", "Iloni", "Tsararano", "Hajangoua", "Ongojou"].map((nom) => ({
  id: `village-${nom.toLowerCase()}`,
  nom,
  creneaux: null,
  fourchetteMinutes: null,
  village: true,
}));

export const TOUS_LES_LIEUX: LieuLivraison[] = [...LIEUX_PRINCIPAUX, ...VILLAGES];

export function trouverLieu(id: string | null | undefined): LieuLivraison | null {
  return TOUS_LES_LIEUX.find((l) => l.id === id) ?? null;
}

function versHeureMinute(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}h${String(minutes % 60).padStart(2, "0")}`;
}

/** « entre 11h00 et 11h30 » pour une fourchette, « 11h20 » sinon. */
export function libelleCreneauLieu(lieu: LieuLivraison | null, creneau: string): string {
  if (!creneau) return "";
  const [h, m] = creneau.split(":").map(Number);
  if (lieu?.fourchetteMinutes) {
    return `entre ${versHeureMinute(h * 60 + m)} et ${versHeureMinute(h * 60 + m + lieu.fourchetteMinutes)}`;
  }
  return versHeureMinute(h * 60 + m);
}

/** Créneaux de livraison proposables : délai minimum respecté, puis créneaux fixes du lieu s'il en a. */
export function creneauxLivraisonPossibles(tous: string[], date: string, lieu: LieuLivraison | null): string[] {
  const apresDelai = filtrerCreneauxLivraison(tous, date);
  return lieu?.creneaux ? apresDelai.filter((c) => lieu.creneaux!.includes(c)) : apresDelai;
}

/** Adresse enregistrée sur la commande : « Lieu — précision » (précision obligatoire pour un village). */
export function composerAdresseLivraison(lieu: LieuLivraison, precision: string): string | null {
  const p = lieu.sansPrecision ? "" : precision.trim();
  if (lieu.village && !p) return null;
  return p ? `${lieu.nom} — ${p}` : lieu.nom;
}

/**
 * « entre 11h00 et 11h30 » pour une commande livrée à l'Université (adresse composée par le nouveau site) dont
 * l'heure enregistrée est le début d'une fourchette ; null pour toute autre commande (affichage inchangé).
 */
export function fourchetteLivraison(adresse: string | null | undefined, heureSouhaiteeIso: string | null | undefined): string | null {
  const fac = LIEUX_PRINCIPAUX[0];
  if (lieuPrincipalDeAdresse(adresse) !== fac || !heureSouhaiteeIso) return null;
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(heureSouhaiteeIso));
  const creneau = parties;
  return fac.creneaux!.includes(creneau) ? libelleCreneauLieu(fac, creneau) : null;
}

/** Lieu principal reconnu dans une adresse (nouveau format « Université de Mayotte… » ou saisie libre « univ », « lycée »…). */
export function lieuPrincipalDeAdresse(adresse: string | null | undefined): LieuLivraison | null {
  const a = (adresse ?? "").toLowerCase();
  if (/univ|\bfac\b/.test(a)) return LIEUX_PRINCIPAUX[0];
  if (/lyc/.test(a)) return LIEUX_PRINCIPAUX[1];
  if (/techno/.test(a)) return LIEUX_PRINCIPAUX[2];
  return null;
}
