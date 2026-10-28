/**
 * Libellé d'une commande dont le paiement est confirmé. Jusqu'au
 * 2026-10-26, tout paiement confirmé s'affichait "DÉJÀ PAYÉE EN LIGNE",
 * même un encaissement espèces ou carte fait au comptoir (retour du
 * patron) : la mention "en ligne" ne vaut que pour Stripe.
 */
type ModePaye = "especes" | "cb" | "stripe" | "mixte" | null | undefined;

export function libellePayee(mode: ModePaye): string {
  if (mode === "stripe") return "DÉJÀ PAYÉE EN LIGNE";
  if (mode === "especes") return "PAYÉE EN ESPÈCES";
  if (mode === "cb") return "PAYÉE PAR CARTE";
  if (mode === "mixte") return "PAYÉE (ESPÈCES + CARTE)";
  return "DÉJÀ PAYÉE";
}

/** Version courte pour une ligne d'écran "Déjà payée en ligne" (casse normale). */
export function libellePayeeCourt(mode: ModePaye): string {
  const l = libellePayee(mode).toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Version ticket thermique (ASCII sans accents, comme le reste du ticket). */
export function libellePayeeTicket(mode: ModePaye): string {
  if (mode === "stripe") return "DEJA PAYEE EN LIGNE";
  if (mode === "especes") return "PAYEE EN ESPECES";
  if (mode === "cb") return "PAYEE PAR CARTE";
  if (mode === "mixte") return "PAYEE (ESPECES + CARTE)";
  return "DEJA PAYEE";
}

/**
 * Mode de paiement global d'une commande d'après ses lignes de paiement
 * réelles : un seul mode -> ce mode, plusieurs -> "mixte". Sert à garder
 * l'étiquette de la commande alignée sur ce qui a vraiment été encaissé
 * (avant le 2026-10-28, seule la ligne de paiement était mise à jour).
 */
export function modeGlobalDepuisPaiements(modes: string[]): "especes" | "cb" | "stripe" | "mixte" | null {
  const distincts = [...new Set(modes)];
  if (distincts.length === 0) return null;
  if (distincts.length > 1) return "mixte";
  const m = distincts[0];
  return m === "especes" || m === "cb" || m === "stripe" ? m : null;
}
