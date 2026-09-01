"use client";

import { useMemo } from "react";

interface CreneauPickerProps {
  creneauxValides: string[]; // ex: ["10:30", "10:40", ..., "15:00"]
  valeur: string; // "HH:MM"
  onChange: (creneau: string) => void;
  label: string;
}

/**
 * Sélecteur heure + minute séparés, pensé pour être rapide sur petit écran
 * mobile (cahier des charges MVP) : deux `<select>` plutôt qu'un picker
 * d'heure natif, dont l'UX varie trop selon l'appareil.
 */
export function CreneauPicker({ creneauxValides, valeur, onChange, label }: CreneauPickerProps) {
  const heures = useMemo(
    () => [...new Set(creneauxValides.map((c) => c.split(":")[0]))],
    [creneauxValides]
  );

  const [heureActuelle, minuteActuelle] = valeur ? valeur.split(":") : [heures[0], undefined];

  const minutesPourHeure = useMemo(
    () =>
      creneauxValides
        .filter((c) => c.split(":")[0] === heureActuelle)
        .map((c) => c.split(":")[1]),
    [creneauxValides, heureActuelle]
  );

  function changerHeure(nouvelleHeure: string) {
    const minutesDisponibles = creneauxValides
      .filter((c) => c.split(":")[0] === nouvelleHeure)
      .map((c) => c.split(":")[1]);
    const minute =
      minuteActuelle && minutesDisponibles.includes(minuteActuelle)
        ? minuteActuelle
        : minutesDisponibles[0];
    onChange(`${nouvelleHeure}:${minute}`);
  }

  function changerMinute(nouvelleMinute: string) {
    onChange(`${heureActuelle}:${nouvelleMinute}`);
  }

  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <div className="mt-1 flex gap-2">
        <select
          value={heureActuelle}
          onChange={(e) => changerHeure(e.target.value)}
          className="w-1/2 rounded border border-gray-600 bg-black p-3 text-base"
        >
          {heures.map((h) => (
            <option key={h} value={h}>
              {h} h
            </option>
          ))}
        </select>
        <select
          value={minuteActuelle ?? minutesPourHeure[0]}
          onChange={(e) => changerMinute(e.target.value)}
          className="w-1/2 rounded border border-gray-600 bg-black p-3 text-base"
        >
          {minutesPourHeure.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
