/**
 * Mayotte est en UTC+3 toute l'année (pas d'heure d'été/hiver) : on peut donc
 * convertir heure locale <-> UTC avec un simple décalage fixe, sans passer
 * par une lib de fuseaux horaires.
 */
const DECALAGE_MAYOTTE_HEURES = 3;

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
export function construireHeureSouhaiteeUtc(creneau: string): Date | null {
  if (!creneauValide(creneau)) return null;
  const [heure, minute] = creneau.split(":").map(Number);

  const maintenantMayotte = new Date(Date.now() + DECALAGE_MAYOTTE_HEURES * 60 * 60 * 1000);
  const annee = maintenantMayotte.getUTCFullYear();
  const mois = maintenantMayotte.getUTCMonth();
  const jour = maintenantMayotte.getUTCDate();

  // On construit la date en "faux UTC" avec l'heure locale de Mayotte, puis
  // on retranche le décalage pour obtenir le véritable instant UTC.
  const instantUtc = new Date(Date.UTC(annee, mois, jour, heure, minute));
  instantUtc.setUTCHours(instantUtc.getUTCHours() - DECALAGE_MAYOTTE_HEURES);
  return instantUtc;
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
