import type { EtapeVisiteur, TypeEvenement } from "./types";

const CLE_VISITEUR = "3sauces_visiteur";

/** Identifiant aléatoire propre à l'onglet (sessionStorage) : jamais de cookie, jamais rattaché à une personne. */
function identifiantVisiteur(): string | null {
  try {
    let id = sessionStorage.getItem(CLE_VISITEUR);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(CLE_VISITEUR, id);
    }
    return id;
  } catch {
    return null;
  }
}

function envoyer(corps: Record<string, unknown>) {
  const visiteur = identifiantVisiteur();
  if (!visiteur) return;
  // Le suivi ne doit jamais gêner une commande : aucun retour attendu, aucune erreur remontée.
  fetch("/api/site/suivi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visiteur, ...corps }),
    keepalive: true,
  }).catch(() => {});
}

export function suivreEvenement(type: TypeEvenement, produit?: string) {
  envoyer({ type, produit });
}

export function suivrePresence(etape: EtapeVisiteur) {
  envoyer({ type: "ping", etape });
}

const CLE_VISITE_DETAIL = "3sauces_visite_detail";

/** Une seule fois par onglet : provenance (étiquette ?src=, site d'origine) et catégorie d'appareil (déduite côté serveur). */
export function suivreVisiteDetaillee() {
  try {
    if (sessionStorage.getItem(CLE_VISITE_DETAIL)) return;
    sessionStorage.setItem(CLE_VISITE_DETAIL, "1");
    let referent: string | null = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.host !== window.location.host) referent = r.hostname;
    } catch {
      referent = null;
    }
    envoyer({
      type: "visite_detail",
      source: new URLSearchParams(window.location.search).get("src"),
      referent,
      page: window.location.pathname,
      tactile: (navigator.maxTouchPoints ?? 0) > 1,
    });
  } catch {
    // jamais d'impact sur la commande
  }
}

/** Clic sur un élément clé (ex. « visuel-offre », « bouton-clique-ici », « onglet-tacos »). */
export function suivreClic(cible: string) {
  envoyer({ type: "clic", cible });
}

/** Produit ouvert (fiche de composition), même s'il n'est pas ajouté au panier. */
export function suivreProduitVu(nom: string) {
  envoyer({ type: "produit_vu", cible: nom });
}

/** Temps passé sur une étape (accueil, menu, panier, validation) ou sur un produit, en millisecondes. */
export function suivreTemps(type: "temps_etape" | "temps_produit", cible: string, dureeMs: number) {
  const duree = Math.round(dureeMs);
  if (duree < 1000 || duree > 1_800_000) return;
  envoyer({ type, cible, duree_ms: duree });
}
