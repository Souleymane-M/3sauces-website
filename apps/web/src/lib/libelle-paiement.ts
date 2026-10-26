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
