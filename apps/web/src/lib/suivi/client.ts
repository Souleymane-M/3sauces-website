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
