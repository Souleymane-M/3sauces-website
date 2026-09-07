import { construireBonCuisineXml, construireTicketClientXml, envoyerImpression } from "./epos-print";
import { obtenirLogoRasterMemo } from "./logo-raster";
import type { CommandePourImpression, ConfigImprimante, ResultatImpression } from "./types";

export interface ConfigImprimantes {
  comptoir: ConfigImprimante | null;
  cuisine: ConfigImprimante | null;
}

/** `null` = imprimante non configurée (pas d'IP renseignée) : rien tenté. */
export interface ResultatImpressionCommande {
  comptoir: ResultatImpression | null;
  cuisine: ResultatImpression | null;
}

/**
 * Imprime une commande sur les 2 imprimantes en parallèle. Une imprimante
 * non configurée ou hors ligne n'empêche jamais l'autre d'imprimer, et
 * n'est jamais remontée comme une erreur bloquante — cf. epos-print.ts,
 * `envoyerImpression` ne lève jamais d'exception.
 */
export async function imprimerCommande(
  commande: CommandePourImpression,
  imprimantes: ConfigImprimantes
): Promise<ResultatImpressionCommande> {
  const { comptoir: configComptoir, cuisine: configCuisine } = imprimantes;

  const [comptoir, cuisine] = await Promise.all([
    configComptoir
      ? obtenirLogoRasterMemo().then((logo) => envoyerImpression(construireTicketClientXml(commande, logo), configComptoir))
      : Promise.resolve(null),
    configCuisine ? envoyerImpression(construireBonCuisineXml(commande), configCuisine) : Promise.resolve(null),
  ]);

  return { comptoir, cuisine };
}
