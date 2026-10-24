"use client";

import { useState } from "react";
import type { TerminalSumUpAdmin } from "@/lib/patron/terminaux-sumup-types";

interface TerminauxSumupAppProps {
  terminauxInitiaux: TerminalSumUpAdmin[];
}

const LIBELLE_STATUT: Record<NonNullable<TerminalSumUpAdmin["statut"]>, string> = {
  paired: "✅ Jumelé et prêt",
  processing: "⏳ En attente de confirmation",
  expired: "⚠️ Jumelage expiré — à refaire",
  unknown: "❓ Statut inconnu",
};

/**
 * Jumelage des boîtiers SumUp Solo (Cloud API) — jamais le Solo Lite
 * (livraison), qui fonctionne en Bluetooth avec un téléphone et n'est
 * pas pilotable depuis le site. Chaque nouveau Solo acheté doit être
 * jumelé une fois ici, par le patron lui-même, sans dépendre d'une
 * intervention technique — cf. vision pilotage à distance.
 */
export function TerminauxSumupApp({ terminauxInitiaux }: TerminauxSumupAppProps) {
  const [terminaux, setTerminaux] = useState<TerminalSumUpAdmin[]>(terminauxInitiaux);
  const [pairingCode, setPairingCode] = useState("");
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [jumelageEnCours, setJumelageEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  async function jumeler() {
    setErreur(null);
    const code = pairingCode.trim().toUpperCase();
    const nomTrim = nom.trim();
    if (!code) {
      setErreur("Entre le code affiché sur le boîtier.");
      return;
    }
    if (!nomTrim) {
      setErreur("Donne un nom à ce terminal.");
      return;
    }

    setJumelageEnCours(true);
    try {
      const reponse = await fetch("/api/patron/sumup/terminaux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: code, nom: nomTrim }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec du jumelage.");
        return;
      }
      setTerminaux((prec) => [...prec, data.terminal]);
      setPairingCode("");
      setNom("");
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setJumelageEnCours(false);
    }
  }

  async function supprimer(terminal: TerminalSumUpAdmin) {
    if (!confirm(`Retirer "${terminal.nom}" ? Il faudra le rejumeler pour le réutiliser.`)) return;
    setErreur(null);
    setSuppressionEnCours(terminal.id);
    try {
      const reponse = await fetch(`/api/patron/sumup/terminaux/${terminal.id}`, { method: "DELETE" });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de la suppression.");
        return;
      }
      setTerminaux((prec) => prec.filter((t) => t.id !== terminal.id));
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setSuppressionEnCours(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Terminaux SumUp</h2>
      <p className="text-xs text-gray-500">
        Uniquement les boîtiers <strong>Solo</strong> (écran tactile, Wi-Fi/4G) — le Solo Lite utilisé en livraison ne
        peut pas être jumelé ici, il fonctionne en Bluetooth avec un téléphone.
      </p>

      {erreur && <p className="text-xs text-orange-400">{erreur}</p>}

      <ul className="space-y-2">
        {terminaux.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-gray-700 p-3">
            <div>
              <p className="text-sm font-semibold text-white">{t.nom}</p>
              <p className="text-xs text-gray-400">{t.statut ? LIBELLE_STATUT[t.statut] : "❓ Statut inconnu"}</p>
            </div>
            <button
              type="button"
              onClick={() => supprimer(t)}
              disabled={suppressionEnCours === t.id}
              className="shrink-0 rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-40"
            >
              {suppressionEnCours === t.id ? "…" : "Retirer"}
            </button>
          </li>
        ))}
        {terminaux.length === 0 && <p className="text-sm text-gray-500">Aucun terminal jumelé pour l&apos;instant.</p>}
      </ul>

      <div className="space-y-2 rounded border border-gray-700 p-3">
        <p className="text-sm font-semibold text-white">Jumeler un nouveau Solo</p>
        <p className="text-xs text-gray-500">
          Sur le boîtier : déconnecte-toi si besoin (menu → Réglages → À propos → Déconnexion), puis menu →
          Connexions → Wi-Fi (connecte-le), puis API → Connecter. Un code à 8-9 caractères s&apos;affiche, valable 5
          minutes.
        </p>
        <input
          value={pairingCode}
          onChange={(e) => setPairingCode(e.target.value)}
          placeholder="Code affiché sur le boîtier"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom (ex: Comptoir)"
          className="w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={jumeler}
          disabled={jumelageEnCours}
          className="w-full rounded bg-white py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {jumelageEnCours ? "Jumelage…" : "Jumeler"}
        </button>
      </div>
    </div>
  );
}
