import type { EncaissementsJour } from "@/lib/encaissements-livraison-types";

interface AlerteEncaissement {
  id: string;
  numero: number;
  nom: string;
  note: string | null;
  signaleeLe: string | null;
}

interface EncaissementsJourAppProps {
  totauxJour: EncaissementsJour;
  alertes: AlerteEncaissement[];
}

function formaterDateHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Contrôle à distance (Page 3) : total encaissé du jour par mode de
 * paiement (vue v_encaissements_jour, déjà présente en base depuis la
 * conception d'origine) et tous les écarts signalés en attente de revue.
 */
export function EncaissementsJourApp({ totauxJour, alertes }: EncaissementsJourAppProps) {
  const total = totauxJour.especes + totauxJour.cb;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Encaissements du jour</h2>
      <div className="flex gap-4 rounded border border-gray-700 p-3 text-sm">
        <div>
          <p className="text-gray-400">Espèces</p>
          <p className="text-lg font-bold">{totauxJour.especes.toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400">Carte</p>
          <p className="text-lg font-bold">{totauxJour.cb.toFixed(2)} €</p>
        </div>
        <div>
          <p className="text-gray-400">Total</p>
          <p className="text-lg font-bold">{total.toFixed(2)} €</p>
        </div>
      </div>

      {alertes.length > 0 && (
        <div className="rounded border border-orange-400 p-3">
          <h3 className="text-sm font-semibold text-orange-400">Écarts signalés</h3>
          <ul className="mt-2 space-y-1 text-xs text-gray-300">
            {alertes.map((a) => (
              <li key={a.id}>
                Commande #{a.numero} — {a.nom || "?"} : {a.note}
                {a.signaleeLe && <span className="text-gray-500"> ({formaterDateHeure(a.signaleeLe)})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
