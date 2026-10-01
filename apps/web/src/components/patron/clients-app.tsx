"use client";

import { useMemo, useState } from "react";
import type { ClientAdmin } from "@/lib/patron/clients";
import { MONTANT_RECOMPENSE, SEUIL_RECOMPENSE, messageFidelite } from "@/lib/fidelite/regles";

interface ClientsAppProps {
  clientsInitiaux: ClientAdmin[];
}

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

/**
 * Liste des clients fidélité — répond à "où est-ce que je vois les clients
 * et leurs tampons ?" : jusqu'ici, uniquement une recherche au cas par cas
 * sur /caisse (un numéro à la fois), aucune vue d'ensemble. Lecture seule :
 * les tampons/récompenses sont calculés automatiquement par la base à
 * chaque paiement, jamais modifiables à la main ici.
 */
export function ClientsApp({ clientsInitiaux }: ClientsAppProps) {
  const [recherche, setRecherche] = useState("");

  const clientsFiltres = useMemo(() => {
    // Les numéros stockés sont toujours en E.164 (+262639..., jamais de 0
    // local) — un client qui tape "0639..." comme il en a l'habitude ne
    // trouverait sinon jamais rien.
    const requete = recherche.trim().replace(/[\s.\-()]/g, "").replace(/^0/, "");
    if (!requete) return clientsInitiaux;
    return clientsInitiaux.filter((c) => c.telephone.includes(requete));
  }, [clientsInitiaux, recherche]);

  const nbRecompensesDisponibles = clientsInitiaux.filter((c) => c.recompenseDisponible).length;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Clients fidélité</h2>
      <p className="text-xs text-gray-500">
        {MONTANT_RECOMPENSE}€ dépensés = 1 tampon. {SEUIL_RECOMPENSE / MONTANT_RECOMPENSE} tampons = {MONTANT_RECOMPENSE}€
        offerts. Calculé automatiquement à chaque paiement (comptoir, livraison, site) — rien à saisir ici.
      </p>

      <div className="flex gap-4 rounded border border-gray-300 p-3 text-sm">
        <div>
          <p className="text-gray-500">Clients</p>
          <p className="text-lg font-bold">{clientsInitiaux.length}</p>
        </div>
        <div>
          <p className="text-gray-500">Récompenses disponibles</p>
          <p className="text-lg font-bold">{nbRecompensesDisponibles}</p>
        </div>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par numéro (ex: 0639...)"
        className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
      />

      {clientsFiltres.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun client trouvé.</p>
      ) : (
        <ul className="space-y-2">
          {clientsFiltres.map((c) => (
            <li key={c.telephone} className="rounded border border-gray-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{c.telephone}</span>
                <span className="font-bold text-gray-900">{c.montantCumule.toFixed(2)} €</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {"🎁".repeat(Math.min(c.tamponsAcquis, 10))}
                  {c.tamponsAcquis > 10 ? ` +${c.tamponsAcquis - 10}` : ""}
                  {c.tamponsAcquis === 0 && "Aucun tampon pour l'instant"}
                </span>
                {c.dateExpiration && <span>Expire le {formaterDate(c.dateExpiration)}</span>}
              </div>
              {c.recompenseDisponible ? (
                <p className="mt-1 text-xs font-bold text-[#2D5A27]">
                  🎁 Récompense de {MONTANT_RECOMPENSE}€ disponible !
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">
                  {messageFidelite({ montantCumule: c.montantCumule, recompenseDisponible: false })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
