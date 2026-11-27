/**
 * Catégories d'appareil déduites de l'en-tête du navigateur : on ne garde JAMAIS l'identifiant brut, seulement
 * « android / telephone / chrome ». Aucune donnée personnelle.
 */
export type SystemeSuivi = "android" | "ios" | "windows" | "macos" | "linux" | "autre";
export type AppareilSuivi = "telephone" | "tablette" | "ordinateur";
export type NavigateurSuivi = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "instagram" | "facebook" | "tiktok" | "autre";

export function categoriserAppareil(userAgent: string, ecranTactile: boolean): { systeme: SystemeSuivi; appareil: AppareilSuivi; navigateur: NavigateurSuivi } {
  const ua = userAgent.slice(0, 500);
  // iPad récent en « site pour ordinateur » : il se déclare Mac, mais il est tactile.
  const ipadMasque = /Macintosh/.test(ua) && ecranTactile;
  let systeme: SystemeSuivi = "autre";
  if (/Android/.test(ua)) systeme = "android";
  else if (/iPhone|iPad|iPod/.test(ua) || ipadMasque) systeme = "ios";
  else if (/Windows/.test(ua)) systeme = "windows";
  else if (/Macintosh|Mac OS X/.test(ua)) systeme = "macos";
  else if (/Linux|X11|CrOS/.test(ua)) systeme = "linux";

  let appareil: AppareilSuivi = "ordinateur";
  if (/iPad/.test(ua) || ipadMasque || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet/.test(ua)) appareil = "tablette";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) appareil = "telephone";

  let navigateur: NavigateurSuivi = "autre";
  if (/Instagram/.test(ua)) navigateur = "instagram";
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) navigateur = "facebook";
  else if (/TikTok|musical_ly|Bytedance/i.test(ua)) navigateur = "tiktok";
  else if (/SamsungBrowser/.test(ua)) navigateur = "samsung";
  else if (/Edg\//.test(ua)) navigateur = "edge";
  else if (/Firefox|FxiOS/.test(ua)) navigateur = "firefox";
  else if (/Chrome|CriOS/.test(ua)) navigateur = "chrome";
  else if (/Safari/.test(ua)) navigateur = "safari";
  return { systeme, appareil, navigateur };
}

/** Domaine d'origine seul (sans chemin ni recherche) ; null = accès direct. */
export function nettoyerReferent(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const v = valeur.trim().toLowerCase().replace(/^www\./, "").slice(0, 80);
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(v) ? v : null;
}
