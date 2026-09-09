import { LIBELLES_STATUT } from "@/lib/cuisine/types";
import type { CommandeHistorique, TempsPreparationEmploye } from "@/lib/patron/commandes-historique-types";

interface CommandesHistoriqueAppProps {
  historiqueInitial: CommandeHistorique[];
  tempsMoyenParEmploye: TempsPreparationEmploye[];
}

function libelleCanal(canal: CommandeHistorique["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
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
 * Historique complet des commandes (Page 3) : qui a fait quoi et quand,
 * remplace l'ancien widget simplifié (retiré, cf.
 * commit "Ajoute la traçabilité commandes") qui ne couvrait que les
 * commandes publiques avec un flux à 3 statuts. L'écart heure souhaitée /
 * heure réelle de livraison n'est pas encore disponible : nécessite le
 * flash QR du livreur (Module 2, pas encore construit).
 */
export function CommandesHistoriqueApp({ historiqueInitial, tempsMoyenParEmploye }: CommandesHistoriqueAppProps) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Historique des commandes</h2>

      {tempsMoyenParEmploye.length > 0 && (
        <div className="rounded border border-gray-700 p-3">
          <h3 className="text-sm font-semibold text-gray-400">Temps de préparation moyen par employé</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {tempsMoyenParEmploye.map((t) => (
              <li key={t.profilNom} className="flex justify-between">
                <span>{t.profilNom}</span>
                <span className="text-gray-400">
                  {t.tempsMoyenMinutes} min ({t.nombreCommandes} commande{t.nombreCommandes > 1 ? "s" : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500">
        50 dernières commandes. Écart heure souhaitée / heure réelle de livraison : à venir (nécessite le flash QR
        livreur, Module 2).
      </p>

      <ul className="space-y-2">
        {historiqueInitial.map((c) => (
          <li key={c.id} className="rounded border border-gray-700 p-3">
            <details>
              <summary className="cursor-pointer text-sm">
                <span className="font-semibold">Commande #{c.numero}</span> — {libelleCanal(c.canal)} —{" "}
                {c.nom || "?"} — <span className="text-gray-400">{LIBELLES_STATUT[c.statut]}</span>
              </summary>
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>Créée le {formaterDateHeure(c.creeLe)}</p>
                {c.livreurNom && <p>Livreur : {c.livreurNom}</p>}
                {c.evenements.length === 0 && <p>Aucun évènement enregistré.</p>}
                {c.evenements.map((e, i) => (
                  <p key={i}>
                    {LIBELLES_STATUT[e.statut]} — {e.profilNom} — {formaterDateHeure(e.creeLe)}
                  </p>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
