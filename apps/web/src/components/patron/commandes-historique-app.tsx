import { LIBELLES_STATUT } from "@/lib/cuisine/types";
import type { CommandeHistorique, TempsPreparationEmploye } from "@/lib/patron/commandes-historique-types";
import { libellePalierGroupe } from "@/lib/commande-publique/groupe-priorite";

interface CommandesHistoriqueAppProps {
  historiqueInitial: CommandeHistorique[];
  tempsMoyenParEmploye: TempsPreparationEmploye[];
}

function libelleCanal(canal: CommandeHistorique["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

function libelleModePaiement(mode: CommandeHistorique["modePaiement"]): string {
  if (mode === "cb") return "Carte";
  if (mode === "stripe") return "En ligne";
  if (mode === "especes") return "Espèces";
  return "?";
}

// Défensif sur chaque champ : d'anciennes commandes (avant l'introduction
// des viandes/sauces/saveurs multiples) ont un `contenu` qui ne respecte
// pas forcément la forme actuelle de LigneCommande.
function detailLigne(l: CommandeHistorique["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes && l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  if (l.boissonIncluse) details.push(`Boisson incluse : ${l.boissonIncluse}`);
  if (l.sansBoisson) details.push("Sans boisson");
  if (l.accompagnementsInclus?.length) details.push(`Accompagnement : ${l.accompagnementsInclus.join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
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

/** Vrai si la date de retrait (Mayotte) est encore dans le futur au moment du rendu — commande passée à l'avance, pas encore due. */
function estCommandeAVenir(heureSouhaitee: string | null): boolean {
  if (!heureSouhaitee) return false;
  const versDateMayotteIso = (iso: string) =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
  return versDateMayotteIso(heureSouhaitee) > versDateMayotteIso(new Date().toISOString());
}

function formaterDateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    weekday: "long",
    day: "numeric",
    month: "long",
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
                {estCommandeAVenir(c.heureSouhaitee) && (
                  <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                    Commande à venir — {formaterDateCourte(c.heureSouhaitee!)}
                  </span>
                )}
                {c.palierGroupe && (
                  <span className="ml-2 rounded bg-orange-900/40 px-1.5 py-0.5 text-xs font-semibold text-orange-400">
                    {libellePalierGroupe(c.palierGroupe)}
                  </span>
                )}
              </summary>
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>Créée le {formaterDateHeure(c.creeLe)}</p>
                {c.telephone && <p>Téléphone : {c.telephone}</p>}
                {c.adresse && <p>Adresse : {c.adresse}</p>}
                {c.livreurNom && <p>Livreur : {c.livreurNom}</p>}
                <p>
                  Total : {c.montant.toFixed(2)} € — Paiement : {libelleModePaiement(c.modePaiement)}
                </p>
              </div>

              <ul className="mt-2 space-y-1 border-t border-gray-700 pt-2 text-xs">
                {c.lignes.length === 0 && <li className="text-gray-500">Contenu indisponible pour cette commande.</li>}
                {c.lignes.map((l, i) => (
                  <li key={i}>
                    <span className="font-semibold">
                      {l.quantite}x {l.nom}
                    </span>
                    {detailLigne(l).map((detail, j) => (
                      <div key={j} className="text-gray-500">
                        {detail}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>

              <div className="mt-2 space-y-1 border-t border-gray-200 pt-2 text-xs text-gray-400">
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
