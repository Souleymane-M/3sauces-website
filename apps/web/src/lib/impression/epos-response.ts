/**
 * Ce que l'imprimante répond après un lot de jobs (Server Direct Print,
 * `ConnectionType=SetResponse`, champ `ResponseFile`) : un résultat par
 * job envoyé. Lu avec des motifs simples plutôt qu'un vrai parseur XML —
 * les exemples Epson ne sont pas toujours un XML bien formé, et seuls
 * l'id du job et le succès nous intéressent.
 */
export interface ResultatImpressionJob {
  jobId: string | null;
  succes: boolean;
  code: string;
}

function attribut(balise: string, nom: string): string {
  return new RegExp(`\\b${nom}="([^"]*)"`).exec(balise)?.[1] ?? "";
}

function resultatDuBloc(bloc: string): ResultatImpressionJob | null {
  const reponse = /<response\b[^>]*>/.exec(bloc)?.[0];
  if (!reponse) return null;
  const jobId = /<printjobid>\s*([^<]*?)\s*<\/printjobid>/.exec(bloc)?.[1] ?? null;
  return { jobId, succes: attribut(reponse, "success") === "true", code: attribut(reponse, "code") };
}

/** Chaque résultat d'un `ResponseFile`, dans l'ordre — tableau vide si rien d'exploitable. */
export function analyserResultats(fichier: string): ResultatImpressionJob[] {
  const blocs = fichier.split(/<ePOSPrint\b/).slice(1);
  const resultats = (blocs.length > 0 ? blocs : [fichier]).map(resultatDuBloc);
  return resultats.filter((r): r is ResultatImpressionJob => r !== null);
}
