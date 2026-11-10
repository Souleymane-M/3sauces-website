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

/** Créneaux d'une heure proposés au lycée, à la Technopole et dans les villages (« entre 11h et 12h », « entre 12h et 13h »). */
const CRENEAUX_HEURE = ["11:00", "12:00"];

export const LIEUX_PRINCIPAUX: LieuLivraison[] = [
  {
    id: "universite",
    nom: "Université de Mayotte",
    creneaux: ["10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"],
    fourchetteMinutes: 30,
    village: false,
    sansPrecision: true,
  },
  { id: "lycee", nom: "Lycée de Dembéni", creneaux: CRENEAUX_HEURE, fourchetteMinutes: 60, village: false, sansPrecision: true },
  { id: "technopole", nom: "Technopole", creneaux: CRENEAUX_HEURE, fourchetteMinutes: 60, village: false },
];

export const VILLAGES: LieuLivraison[] = ["Dembéni", "Iloni", "Tsararano", "Hajangoua", "Ongojou"].map((nom) => ({
  id: `village-${nom.toLowerCase()}`,
  nom,
  creneaux: CRENEAUX_HEURE,
  fourchetteMinutes: 60,
  village: true,
}));

export const TOUS_LES_LIEUX: LieuLivraison[] = [...LIEUX_PRINCIPAUX, ...VILLAGES];

export function trouverLieu(id: string | null | undefined): LieuLivraison | null {
  return TOUS_LES_LIEUX.find((l) => l.id === id) ?? null;
}

function versHeureMinute(minutes: number, sansMinutesNulles = false): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  return sansMinutesNulles && minutes % 60 === 0 ? `${h}h` : `${h}h${String(minutes % 60).padStart(2, "0")}`;
}

/** « entre 11h00 et 11h30 » ou « entre 11h et 12h » (minutes à zéro omises) pour une fourchette, « 11h20 » sinon. */
export function libelleCreneauLieu(lieu: LieuLivraison | null, creneau: string): string {
  if (!creneau) return "";
  const [h, m] = creneau.split(":").map(Number);
  if (lieu?.fourchetteMinutes) {
    const entiere = lieu.fourchetteMinutes % 60 === 0;
    return `entre ${versHeureMinute(h * 60 + m, entiere)} et ${versHeureMinute(h * 60 + m + lieu.fourchetteMinutes, entiere)}`;
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

/** « entre 11h00 et 11h30 » / « entre 11h et 12h » pour une commande livrée dans un lieu à fourchette dont l'heure enregistrée est le début d'un créneau ; null sinon (affichage inchangé). */
export function fourchetteLivraison(adresse: string | null | undefined, heureSouhaiteeIso: string | null | undefined): string | null {
  const lieu = lieuPrincipalDeAdresse(adresse);
  if (!lieu?.creneaux || !lieu.fourchetteMinutes || !heureSouhaiteeIso) return null;
  const creneau = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(heureSouhaiteeIso));
  return lieu.creneaux.includes(creneau) ? libelleCreneauLieu(lieu, creneau) : null;
}

/** Lieu principal reconnu dans une adresse (nouveau format « Université de Mayotte… » ou saisie libre « univ », « lycée »…). */
export function lieuPrincipalDeAdresse(adresse: string | null | undefined): LieuLivraison | null {
  const a = (adresse ?? "").toLowerCase();
  if (/univ|\bfac\b/.test(a)) return LIEUX_PRINCIPAUX[0];
  if (/lyc/.test(a)) return LIEUX_PRINCIPAUX[1];
  if (/techno/.test(a)) return LIEUX_PRINCIPAUX[2];
  // Villages : uniquement l'adresse composée « Village — précision » (jamais un simple mot dans une saisie libre).
  return VILLAGES.find((v) => adresse && (adresse.trim() === v.nom || adresse.trim().startsWith(`${v.nom} — `))) ?? null;
}
