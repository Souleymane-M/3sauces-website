export interface TerminalSumUpAdmin {
  id: string;
  nom: string;
  readerId: string;
  /** Statut live interrogé auprès de SumUp au chargement — null si l'appel a échoué (jamais bloquant pour l'affichage). */
  statut: "unknown" | "processing" | "paired" | "expired" | null;
}
