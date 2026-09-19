"use client";

import { useState } from "react";

interface JoursFermetureAppProps {
  joursInitiaux: number[]; // 0 = dimanche ... 6 = samedi
}

// Ordre d'affichage lundi -> dimanche (valeurs Date.getUTCDay() correspondantes).
const JOURS_AFFICHES: { valeur: number; label: string }[] = [
  { valeur: 1, label: "Lun" },
  { valeur: 2, label: "Mar" },
  { valeur: 3, label: "Mer" },
  { valeur: 4, label: "Jeu" },
  { valeur: 5, label: "Ven" },
  { valeur: 6, label: "Sam" },
  { valeur: 0, label: "Dim" },
];

/**
 * Jours d'ouverture de la semaine — distinct de l'interrupteur "site
 * ouvert/fermé" (pause ponctuelle) : ceci ne bloque jamais l'accès au site,
 * ça restreint seulement les dates de retrait proposées sur /commander.
 * Même convention de bascule optimiste que EtatSiteApp.
 */
export function JoursFermetureApp({ joursInitiaux }: JoursFermetureAppProps) {
  const [joursFermes, setJoursFermes] = useState(new Set(joursInitiaux));
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer(jour: number) {
    setErreur(null);

    const nouveauxFermes = new Set(joursFermes);
    if (nouveauxFermes.has(jour)) {
      nouveauxFermes.delete(jour);
    } else {
      if (nouveauxFermes.size === 6) {
        setErreur("Impossible de fermer les 7 jours : il faut au moins un jour d'ouverture.");
        return;
      }
      nouveauxFermes.add(jour);
    }

    const precedent = joursFermes;
    setJoursFermes(nouveauxFermes);

    const reponse = await fetch("/api/patron/jours-fermeture", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jours: [...nouveauxFermes] }),
    });
    if (!reponse.ok) {
      setJoursFermes(precedent);
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la mise à jour.");
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="font-semibold text-white">Jours d&apos;ouverture de la semaine</div>
      <p className="mt-1 text-xs text-gray-400">
        Les jours décochés ne sont pas proposés comme date de retrait sur le site. Les clients peuvent
        toujours commander à l&apos;avance pour un jour ouvert.
      </p>
      {erreur && <p className="mt-1 text-xs text-orange-400">{erreur}</p>}
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {JOURS_AFFICHES.map(({ valeur, label }) => {
          const ferme = joursFermes.has(valeur);
          return (
            <button
              key={valeur}
              type="button"
              aria-pressed={!ferme}
              onClick={() => basculer(valeur)}
              className={`rounded py-2 text-xs font-bold uppercase text-white ${
                ferme ? "bg-red-900/60" : "bg-green-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
