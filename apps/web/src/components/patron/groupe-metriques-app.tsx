import type { MetriquesGroupe } from "@/lib/patron/groupe-metriques";

interface GroupeMetriquesAppProps {
  metriques: MetriquesGroupe;
}

/**
 * Suivi de l'offre "commande groupée avant 11h" — carte en lecture seule,
 * même style que EtatSiteApp/JoursFermetureApp. Le nombre de plats livrés
 * par déplacement et les retards/réclamations ne sont pas ici : à suivre
 * manuellement, aucune donnée exploitable en base pour ces deux points.
 */
export function GroupeMetriquesApp({ metriques }: GroupeMetriquesAppProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="font-semibold text-white">Commande groupée avant 11h — 7 derniers jours</div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-gray-400">Commandes GROUPE 3</div>
          <div className="text-xl font-bold text-white">{metriques.nombreGroupe3}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Commandes GROUPE 4 (boisson offerte)</div>
          <div className="text-xl font-bold text-white">{metriques.nombreGroupe4}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">CA généré</div>
          <div className="text-xl font-bold text-white">{metriques.chiffreAffaires.toFixed(2)} €</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Panier moyen</div>
          <div className="text-xl font-bold text-white">{metriques.panierMoyen.toFixed(2)} €</div>
        </div>
      </div>
    </div>
  );
}
