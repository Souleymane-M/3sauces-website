/**
 * État partagé du verrouillage automatique de l'appareil (cf.
 * components/equipe/use-verrou-appareil.ts) : sans lui, 45 s sans toucher
 * l'écran (client qui hésite au comptoir) déconnectaient l'employé EN PLEIN
 * encaissement — "Non authentifié" au moment d'imprimer (2026-10-29).
 */
const CLE_ACTIVITE = "3sauces_derniere_activite";

let suspensions = 0;

/** Tant qu'une saisie est en cours, le verrouillage est suspendu ; renvoie la fonction qui lève la suspension. */
export function suspendreVerrou(): () => void {
  suspensions += 1;
  let leve = false;
  return () => {
    if (leve) return;
    leve = true;
    suspensions = Math.max(0, suspensions - 1);
  };
}

export function verrouSuspendu(): boolean {
  return suspensions > 0;
}

/** Dernière activité, partagée entre tous les onglets (/caisse et /equipe ouverts sur le même appareil partagent le même cookie de session). */
export function noterActivite(): void {
  try {
    localStorage.setItem(CLE_ACTIVITE, String(Date.now()));
  } catch {
    // Stockage indisponible : le verrouillage retombe sur l'activité de cet onglet seul.
  }
}

export function derniereActivite(): number {
  try {
    return Number(localStorage.getItem(CLE_ACTIVITE)) || 0;
  } catch {
    return 0;
  }
}
