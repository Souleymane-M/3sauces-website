"use client";

import { PROFILS_CLIENT, type ProfilClient } from "@/lib/profil-client";

interface Props {
  valeur: ProfilClient | null;
  onChange: (profil: ProfilClient) => void;
  /** Obligatoire : le cadre est mis en évidence tant que rien n'est choisi. */
  obligatoire?: boolean;
  titre?: string;
  /** Phrase affichée sous le titre pour expliquer pourquoi on pose la question. */
  explication?: string;
}

/** Case à cocher « Tu es… » (profil du client) : une seule réponse, demandée une fois par client. */
export function ProfilClientChoix({ valeur, onChange, obligatoire = true, titre = "Tu es…", explication }: Props) {
  return (
    <div className={`rounded-lg border-2 p-3 ${obligatoire && !valeur ? "border-[#8B2020] bg-[#FFF8F0]" : "border-gray-300 bg-white"}`}>
      <p className="text-sm font-extrabold text-gray-900">
        {titre}
      </p>
      {explication && <p className="mt-0.5 text-sm font-semibold text-gray-700">{explication}</p>}
      <div className="mt-2 space-y-2">
        {PROFILS_CLIENT.map((p) => (
          <label
            key={p.valeur}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 ${
              valeur === p.valeur ? "border-[#8B2020] bg-[#8B2020]/10" : "border-gray-300 bg-white"
            }`}
          >
            <input
              type="radio"
              name="profil-client"
              checked={valeur === p.valeur}
              onChange={() => onChange(p.valeur)}
              className="h-5 w-5 shrink-0 accent-[#8B2020]"
            />
            <span className="text-base font-bold text-gray-900">{p.libelle}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
