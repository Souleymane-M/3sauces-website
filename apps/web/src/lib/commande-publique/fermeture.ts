/**
 * Message affiché au client quand le site est fermé (interrupteur « site ouvert » coupé dans /patron).
 * Un motif précis peut être donné pour un jour précis (le message ne ressort jamais un autre jour) ;
 * sinon, un message neutre et professionnel.
 */
const MOTIFS_FERMETURE_PAR_DATE: Record<string, string> = {
  "2026-11-05": "En raison de la grève d'aujourd'hui, 3 Sauces est exceptionnellement fermé.",
};

export function messageFermeture(dateIso: string): { titre: string; texte: string } {
  const motif = MOTIFS_FERMETURE_PAR_DATE[dateIso];
  return {
    titre: "Exceptionnellement fermé",
    texte: `${motif ?? "3 Sauces est exceptionnellement fermé pour le moment."} Merci de votre compréhension, nous vous retrouvons très bientôt !`,
  };
}
