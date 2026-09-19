/**
 * Mayotte est en UTC+3 toute l'année (pas d'heure d'été/hiver) : on peut donc
 * convertir heure locale <-> UTC avec un simple décalage fixe, sans passer
 * par une lib de fuseaux horaires.
 */
const DECALAGE_MAYOTTE_HEURES = 3;

/** Fenêtre de réservation à l'avance : 14 jours calendaires glissants — une constante, pas un réglage /patron. */
export const FENETRE_RESERVATION_JOURS = 14;

const RE_CRENEAU = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Valide le format "HH:MM" d'un créneau saisi par le client. */
export function creneauValide(creneau: string): creneau is string {
  return RE_CRENEAU.test(creneau);
}

/**
 * Vérifie qu'un créneau "HH:MM" tombe dans la plage [heureDebut, heureFin]
 * (bornes incluses), elles-mêmes au format "HH:MM:SS" tel que renvoyé par
 * Postgres pour une colonne `time`.
 */
export function creneauDansPlage(creneau: string, heureDebut: string, heureFin: string): boolean {
  if (!creneauValide(creneau)) return false;
  const [h, m] = creneau.split(":").map(Number);
  const minutesCreneau = h * 60 + m;

  const versMinutes = (hhmmss: string) => {
    const [hh, mm] = hhmmss.split(":").map(Number);
    return hh * 60 + mm;
  };

  return minutesCreneau >= versMinutes(heureDebut) && minutesCreneau <= versMinutes(heureFin);
}

/**
 * Construit l'instant UTC correspondant à un créneau "HH:MM" pour la
 * journée courante en heure de Mayotte (et non la date UTC du serveur, qui
 * peut différer de 3h près de minuit).
 */
export function construireHeureSouhaiteeUtc(creneau: string, date: string = dateMayotteIso()): Date | null {
  if (!creneauValide(creneau) || !dateIsoValide(date)) return null;
  const [heure, minute] = creneau.split(":").map(Number);
  const [annee, mois, jour] = date.split("-").map(Number);

  // On construit la date en "faux UTC" avec l'heure locale de Mayotte, puis
  // on retranche le décalage pour obtenir le véritable instant UTC.
  const instantUtc = new Date(Date.UTC(annee, mois - 1, jour, heure, minute));
  instantUtc.setUTCHours(instantUtc.getUTCHours() - DECALAGE_MAYOTTE_HEURES);
  return instantUtc;
}

/** Date du jour à Mayotte, "YYYY-MM-DD" — jamais la date UTC du serveur, qui peut différer de 3h près de minuit. */
export function dateMayotteIso(): string {
  const maintenantMayotte = new Date(Date.now() + DECALAGE_MAYOTTE_HEURES * 60 * 60 * 1000);
  const annee = maintenantMayotte.getUTCFullYear();
  const mois = String(maintenantMayotte.getUTCMonth() + 1).padStart(2, "0");
  const jour = String(maintenantMayotte.getUTCDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

/** Ajoute (ou retranche) un nombre de jours calendaires à une date ISO, sans notion d'heure. */
export function ajouterJoursIso(date: string, jours: number): string {
  const [annee, mois, jour] = date.split("-").map(Number);
  const resultat = new Date(Date.UTC(annee, mois - 1, jour + jours));
  return `${resultat.getUTCFullYear()}-${String(resultat.getUTCMonth() + 1).padStart(2, "0")}-${String(resultat.getUTCDate()).padStart(2, "0")}`;
}

const RE_DATE_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Valide le format "YYYY-MM-DD" d'une date envoyée par le client. */
export function dateIsoValide(date: string): boolean {
  return RE_DATE_ISO.test(date);
}

/** Jour de la semaine d'une date ISO : 0 = dimanche ... 6 = samedi (convention JS Date.getUTCDay()). */
export function jourSemaineIso(date: string): number {
  const [annee, mois, jour] = date.split("-").map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay();
}

/**
 * Créneaux réellement proposables pour une date donnée : la journée
 * complète si la date est future, mais seulement les créneaux à venir
 * (>= heure actuelle à Mayotte) si la date est aujourd'hui — un client ne
 * doit jamais pouvoir "commander pour maintenant" un créneau déjà passé.
 * Tableau vide si la cuisine a déjà fermé pour aujourd'hui.
 */
export function creneauxPourDate(date: string, heureDebut: string, heureFin: string, pasMinutes = 10): string[] {
  const creneaux = genererCreneaux(heureDebut, heureFin, pasMinutes);
  if (date !== dateMayotteIso()) return creneaux;

  const maintenantMayotte = new Date(Date.now() + DECALAGE_MAYOTTE_HEURES * 60 * 60 * 1000);
  const minutesActuelles = maintenantMayotte.getUTCHours() * 60 + maintenantMayotte.getUTCMinutes();
  const versMinutes = (c: string) => {
    const [hh, mm] = c.split(":").map(Number);
    return hh * 60 + mm;
  };
  return creneaux.filter((c) => versMinutes(c) >= minutesActuelles);
}

/**
 * Prochaines dates de retrait réellement ouvertes, en ISO, dans l'ordre.
 * Saute les jours de fermeture hebdomadaire, et saute aujourd'hui s'il ne
 * reste plus aucun créneau pour aujourd'hui (cf. `creneauxPourDate`) — un
 * client ne doit jamais se voir proposer une date sans aucun horaire
 * possible. Source de vérité unique, utilisée côté UI et côté serveur.
 */
export function prochainesDatesOuvertes(
  joursFermeture: number[],
  heureDebut: string,
  heureFin: string,
  nombreJours = FENETRE_RESERVATION_JOURS
): string[] {
  const dates: string[] = [];
  let curseur = dateMayotteIso();
  for (let i = 0; i < nombreJours; i++) {
    const estFerme = joursFermeture.includes(jourSemaineIso(curseur));
    const aDesCreneaux = creneauxPourDate(curseur, heureDebut, heureFin).length > 0;
    if (!estFerme && aDesCreneaux) dates.push(curseur);
    curseur = ajouterJoursIso(curseur, 1);
  }
  return dates;
}

/** Bornes UTC [début, fin) du jour Mayotte donné — pour filtrer une colonne timestamptz par jour calendaire Mayotte. */
export function plageJourMayotteUtc(date: string): { debut: Date; fin: Date } {
  return {
    debut: construireHeureSouhaiteeUtc("00:00", date)!,
    fin: construireHeureSouhaiteeUtc("00:00", ajouterJoursIso(date, 1))!,
  };
}

/** "Aujourd'hui (lundi 22 septembre)" si la date correspond à aujourd'hui, sinon "Lundi 22 septembre". */
export function libelleDateFr(date: string, aujourdHui: string): string {
  const libelle = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
  const capitalise = libelle.charAt(0).toUpperCase() + libelle.slice(1);
  return date === aujourdHui ? `Aujourd'hui (${capitalise})` : capitalise;
}

/**
 * Génère la liste des créneaux "HH:MM" valides par pas de `pasMinutes`
 * entre `heureDebut` et `heureFin` (bornes incluses, format "HH:MM:SS").
 * Utilisé pour construire le sélecteur heure/minute côté UI, à partir des
 * paramètres réels en base (jamais codés en dur).
 */
export function genererCreneaux(heureDebut: string, heureFin: string, pasMinutes = 10): string[] {
  const versMinutes = (hhmmss: string) => {
    const [hh, mm] = hhmmss.split(":").map(Number);
    return hh * 60 + mm;
  };

  const debut = versMinutes(heureDebut);
  const fin = versMinutes(heureFin);
  const creneaux: string[] = [];

  for (let m = debut; m <= fin; m += pasMinutes) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    creneaux.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return creneaux;
}

/**
 * Détermine le créneau à présélectionner par défaut dans le sélecteur.
 *
 * On ne présélectionne jamais le tout premier créneau de la liste (l'heure
 * d'ouverture) : si le client n'a pas encore choisi d'heure, il n'y a aucune
 * raison de le faire démarrer sur l'heure d'ouverture, où seule une partie
 * des minutes (ex: 30/40/50 si l'ouverture est à 10h30) est disponible — ça
 * peut donner l'impression trompeuse que les autres minutes n'existent pas.
 * On présélectionne plutôt le premier créneau à venir (>= heure actuelle à
 * Mayotte), pour que la plage complète de minutes soit visible dès l'ouverture
 * du sélecteur. Si l'heure actuelle dépasse la fermeture, ou si aucun
 * créneau n'est disponible, on retombe sur le premier créneau de la liste.
 */
export function prochainCreneauValide(creneauxValides: string[]): string {
  if (creneauxValides.length === 0) return "";

  const maintenantMayotte = new Date(Date.now() + DECALAGE_MAYOTTE_HEURES * 60 * 60 * 1000);
  const minutesActuelles = maintenantMayotte.getUTCHours() * 60 + maintenantMayotte.getUTCMinutes();

  const versMinutes = (creneau: string) => {
    const [hh, mm] = creneau.split(":").map(Number);
    return hh * 60 + mm;
  };

  const prochain = creneauxValides.find((c) => versMinutes(c) >= minutesActuelles);
  return prochain ?? creneauxValides[0];
}
