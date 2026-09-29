import type { Canal } from "@3sauces/supabase";
import type { StatistiquesJour } from "@/lib/patron/statistiques";
import { libelleModePaiementStat } from "@/lib/patron/statistiques";

interface StatistiquesJourAppProps {
  stats: StatistiquesJour;
}

function libelleCanal(canal: Canal): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

/**
 * Chiffre d'affaires du jour, tous modes de paiement confondus — jusqu'ici
 * seul l'espèces/CB physiquement encaissé était visible (cf.
 * EncaissementsJourApp, qui reste utile pour le rapprochement de caisse),
 * les paiements en ligne (Stripe) n'apparaissaient nulle part. Repart de
 * `commandes.montant` (source de vérité unique, peu importe le mode).
 */
export function StatistiquesJourApp({ stats }: StatistiquesJourAppProps) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Ventes du jour</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-gray-700 p-3">
          <p className="text-xs text-gray-400">Chiffre d&apos;affaires</p>
          <p className="text-2xl font-bold">{stats.caTotal.toFixed(2)} €</p>
          <p className="text-xs text-gray-500">{stats.nbCommandesTotal} commande{stats.nbCommandesTotal > 1 ? "s" : ""}</p>
        </div>
        <div className="rounded border border-gray-700 p-3">
          <p className="text-xs text-gray-400">Ticket moyen</p>
          <p className="text-2xl font-bold">{stats.ticketMoyen.toFixed(2)} €</p>
        </div>
        <div className="rounded border border-gray-700 p-3">
          <p className="text-xs text-gray-400">Marge brute</p>
          <p className="text-2xl font-bold">{stats.margeBrute.margeBruteJour.toFixed(2)} €</p>
          <p className="text-xs text-gray-500">Coût matière : {stats.margeBrute.coutMatiereJour.toFixed(2)} €</p>
        </div>
        <div className="rounded border border-gray-700 p-3">
          <p className="text-xs text-gray-400">Produit le plus rentable</p>
          {stats.produitPlusRentable ? (
            <>
              <p className="text-base font-bold">{stats.produitPlusRentable.nom}</p>
              <p className="text-xs text-gray-500">
                {stats.produitPlusRentable.quantiteVendue} vendu(s) — {stats.produitPlusRentable.margeTotale.toFixed(2)} € de
                marge
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>
      </div>

      {stats.margeBrute.commandesSansCout > 0 && (
        <p className="rounded border border-orange-400 p-2 text-xs text-orange-400">
          ⚠️ {stats.margeBrute.commandesSansCout} commande(s) du jour sans coût matière renseigné — la marge ci-dessus
          est sous-estimée.
        </p>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-300">Par canal</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {stats.caParCanal.length === 0 && <li className="text-gray-500">Aucune vente aujourd&apos;hui.</li>}
          {stats.caParCanal.map((c) => (
            <li key={c.canal} className="flex justify-between border-b border-gray-800 py-1">
              <span className="text-gray-400">
                {libelleCanal(c.canal)} ({c.nbCommandes})
              </span>
              <span className="font-semibold">{c.ca.toFixed(2)} €</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-300">Par mode de paiement</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {stats.repartitionPaiement.length === 0 && <li className="text-gray-500">Aucune vente aujourd&apos;hui.</li>}
          {stats.repartitionPaiement.map((p) => (
            <li key={p.mode} className="flex justify-between border-b border-gray-800 py-1">
              <span className="text-gray-400">
                {libelleModePaiementStat(p.mode)} ({p.nbCommandes})
              </span>
              <span className="font-semibold">{p.montant.toFixed(2)} €</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
