"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LIBELLES_STATUT, TRANSITIONS_PAR_CANAL, type LivreurActif } from "@/lib/cuisine/types";
import type { CommandeHistorique, TempsPreparationEmploye } from "@/lib/patron/commandes-historique-types";
import { libellePalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";

interface CommandesHistoriqueAppProps {
  historiqueInitial: CommandeHistorique[];
  tempsMoyenParEmploye: TempsPreparationEmploye[];
  /** Pour attribuer les changements de statut faits depuis cet écran (cf. `commandes_evenements`). */
  profilId: string;
  /** Nécessaire pour la transition "Pris par le livreur" en livraison. */
  livreursActifs: LivreurActif[];
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
 *
 * Fait aussi office de secours pour faire avancer une commande (mêmes
 * transitions, même endpoint `/api/cuisine/commandes` que l'écran cuisine
 * `/commandes`) : le fonctionnement normal reste de surveiller `/commandes`
 * en cuisine, ceci n'est qu'un filet de sécurité si personne ne s'en occupe
 * côté cuisine à un moment donné.
 */
export function CommandesHistoriqueApp({
  historiqueInitial,
  tempsMoyenParEmploye,
  profilId,
  livreursActifs,
}: CommandesHistoriqueAppProps) {
  const router = useRouter();
  const [livreurChoisi, setLivreurChoisi] = useState<Record<string, string>>({});
  const [enCoursId, setEnCoursId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function appliquerChangement(commandeId: string, statut: string, livreurId?: string) {
    setErreur(null);
    setEnCoursId(commandeId);
    try {
      const reponse = await fetch("/api/cuisine/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, statut, profilId, livreurId }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec du changement de statut.");
        return;
      }
      router.refresh();
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnCoursId(null);
    }
  }

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
        livreur, Module 2). Faire avancer une commande ici est un secours — le suivi normal se fait depuis
        l&apos;écran cuisine <span className="font-semibold">/commandes</span>.
      </p>

      {erreur && <p className="text-sm text-red-500">{erreur}</p>}

      <ul className="space-y-2">
        {historiqueInitial.map((c) => {
          const statutSuivant = TRANSITIONS_PAR_CANAL[c.canal]?.[c.statut];
          const demandeLivreur = statutSuivant === "pris_par_livreur";
          const livreurSelectionne = livreurChoisi[c.id] ?? "";

          return (
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
                  {c.lignes.length === 0 && (
                    <li className="text-gray-500">Contenu indisponible pour cette commande.</li>
                  )}
                  {c.lignes.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="font-semibold">
                          {l.quantite * piecesParPaquet(l.nom)}x {nomSansMultiplicateur(l.nom)}
                        </span>
                        {detailLigne(l).map((detail, j) => (
                          <div key={j} className="text-gray-500">
                            {detail}
                          </div>
                        ))}
                      </div>
                      <span className="shrink-0 text-gray-400">{(l.prixUnitaire * l.quantite).toFixed(2)} €</span>
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

                {statutSuivant && (
                  <div className="mt-2 space-y-2 border-t border-gray-700 pt-2">
                    {demandeLivreur && (
                      <select
                        value={livreurSelectionne}
                        onChange={(e) => setLivreurChoisi((prec) => ({ ...prec, [c.id]: e.target.value }))}
                        className="w-full rounded border border-gray-700 bg-transparent p-2 text-xs"
                      >
                        <option value="">Choisir le livreur…</option>
                        {livreursActifs.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nom}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        appliquerChangement(c.id, statutSuivant, demandeLivreur ? livreurSelectionne : undefined)
                      }
                      disabled={enCoursId === c.id || (demandeLivreur && !livreurSelectionne)}
                      className="w-full rounded bg-[#8B2020] py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      {enCoursId === c.id ? "…" : LIBELLES_STATUT[statutSuivant]}
                    </button>
                  </div>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
