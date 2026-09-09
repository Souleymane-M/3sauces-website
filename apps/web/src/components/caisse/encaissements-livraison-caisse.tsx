"use client";

import { useState } from "react";
import type { LivraisonAEncaisser } from "@/lib/encaissements-livraison-types";

interface EncaissementsLivraisonCaisseProps {
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
 * Même donnée et même API que components/patron/encaissements-livraison-app.tsx
 * (contrôle à distance) — ici en thème clair pour le responsable de caisse
 * qui valide sur place, après contrôle, au retour du livreur.
 */
export function EncaissementsLivraisonCaisse({ livraisonsInitiales }: EncaissementsLivraisonCaisseProps) {
  const [livraisons, setLivraisons] = useState<LivraisonAEncaisser[]>(livraisonsInitiales);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function marquerEncaissee(livraison: LivraisonAEncaisser) {
    setErreur(null);
    setEnCours(livraison.id);
    const precedentes = livraisons;
    setLivraisons((prec) => prec.filter((l) => l.id !== livraison.id));

    try {
      const reponse = await fetch("/api/encaissements-livraison", {
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
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Coche chaque livraison une fois l&apos;argent récupéré et vérifié au retour du livreur.
      </p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      {livraisons.length === 0 && <p className="text-lg text-gray-400">Aucune livraison en attente d&apos;encaissement.</p>}

      <ul className="space-y-3">
        {livraisons.map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-semibold text-gray-900">
                Commande #{l.numero} — {l.nom || "?"}
              </p>
              <p className="text-sm text-gray-500">
                {l.adresse} — {formaterDateHeure(l.creeLe)} — {l.modePaiement === "cb" ? "Carte" : "Espèces"} prévu(e)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-gray-900">{l.montant.toFixed(2)} €</span>
              <button
                onClick={() => marquerEncaissee(l)}
                disabled={enCours === l.id}
                className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
