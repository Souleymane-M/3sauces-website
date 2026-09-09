"use client";

import { useState } from "react";
import type { LivraisonAEncaisser } from "@/lib/patron/encaissements-livraison-types";

interface EncaissementsLivraisonAppProps {
  livraisonsInitiales: LivraisonAEncaisser[];
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
 * Une livraison prise au téléphone par la caisse est enregistrée
 * "non_paye" (le client paie le livreur à la remise, pas la caisse à la
 * prise de commande) — cette liste régularise ça au retour du livreur,
 * commande par commande.
 */
export function EncaissementsLivraisonApp({ livraisonsInitiales }: EncaissementsLivraisonAppProps) {
  const [livraisons, setLivraisons] = useState<LivraisonAEncaisser[]>(livraisonsInitiales);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function marquerEncaissee(livraison: LivraisonAEncaisser) {
    setErreur(null);
    setEnCours(livraison.id);
    const precedentes = livraisons;
    setLivraisons((prec) => prec.filter((l) => l.id !== livraison.id));

    try {
      const reponse = await fetch("/api/patron/encaissements-livraison", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: livraison.id }),
      });
      if (!reponse.ok) {
        setLivraisons(precedentes);
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de l'encaissement.");
      }
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Encaissements livraison</h2>
      <p className="text-xs text-gray-500">
        Une livraison prise par téléphone n&apos;est payée qu&apos;à la remise, pas à la prise de commande. Coche
        chaque livraison une fois l&apos;argent récupéré au retour du livreur.
      </p>
      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      {livraisons.length === 0 && <p className="text-sm text-gray-500">Aucune livraison en attente d&apos;encaissement.</p>}

      <ul className="space-y-2">
        {livraisons.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 rounded border border-gray-700 p-3">
            <div>
              <p className="text-sm font-semibold">
                Commande #{l.numero} — {l.nom || "?"}
              </p>
              <p className="text-xs text-gray-400">
                {l.adresse} — {formaterDateHeure(l.creeLe)} — {l.modePaiement === "cb" ? "Carte" : "Espèces"} prévu(e)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{l.montant.toFixed(2)} €</span>
              <button
                onClick={() => marquerEncaissee(l)}
                disabled={enCours === l.id}
                className="rounded bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
              >
                Encaissée
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
