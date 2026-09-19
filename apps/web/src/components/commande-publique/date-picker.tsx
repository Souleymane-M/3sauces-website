"use client";

import { libelleDateFr } from "@/lib/commande-publique/creneau";

interface DatePickerProps {
  dates: string[]; // ISO "YYYY-MM-DD", déjà filtrées (jours ouverts uniquement)
  aujourdHui: string; // ISO, pour libeller la première entrée "Aujourd'hui"
  valeur: string;
  onChange: (date: string) => void;
  label: string;
}

/**
 * Sélecteur de date de retrait/livraison, parmi les prochains jours
 * d'ouverture réels — jamais les jours de fermeture hebdomadaire, qui sont
 * simplement absents de la liste (pas grisés : peu lisible sur mobile dans
 * un <select> natif, et la liste ne fait qu'une dizaine d'entrées).
 */
export function DatePicker({ dates, aujourdHui, valeur, onChange, label }: DatePickerProps) {
  if (dates.length === 0) {
    return (
      <div>
        <label className="text-xs text-gray-500">{label}</label>
        <select disabled className="mt-1 w-full rounded border border-gray-300 bg-gray-100 p-3 text-base text-gray-500">
          <option>Aucune date disponible</option>
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-gray-300 bg-white p-3 text-base text-gray-900"
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {libelleDateFr(date, aujourdHui)}
          </option>
        ))}
      </select>
      {dates[0] !== aujourdHui && (
        <p className="mt-1 text-xs text-gray-500">
          Nous sommes fermés aujourd&apos;hui — première date disponible : {libelleDateFr(dates[0], aujourdHui)}.
        </p>
      )}
    </div>
  );
}
