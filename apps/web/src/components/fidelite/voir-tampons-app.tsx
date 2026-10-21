"use client";

import { useState } from "react";
import type { ActivationFidelite } from "@/lib/fidelite/activation";
import { NB_TAMPONS_RECOMPENSE } from "@/lib/fidelite/regles";

interface VoirTamponsAppProps {
  code: string;
  activationInitiale: ActivationFidelite;
}

/** Tampons pleins/vides sur la base de 10 — ex: 13 tampons → ●●●●●●●●●● (+3), même rendu que le ticket imprimé. */
function rendreTampons(nombre: number): string {
  const surDix = nombre % NB_TAMPONS_RECOMPENSE || (nombre > 0 ? NB_TAMPONS_RECOMPENSE : 0);
  const pleins = "●".repeat(surDix);
  const vides = "○".repeat(NB_TAMPONS_RECOMPENSE - surDix);
  const supplement = nombre > NB_TAMPONS_RECOMPENSE ? ` (+${nombre - surDix})` : "";
  return `${pleins}${vides}${supplement}`;
}

/**
 * Page atteinte en scannant le QR du reçu une fois la commande livrée —
 * identifie le client par cette livraison précise, jamais en lui
 * redemandant son numéro. Si aucun email n'est enregistré (facultatif à
 * la commande en caisse), il doit le saisir pour voir son solde — objectif
 * explicite du patron, 2026-10-21 : récupérer un maximum d'emails.
 */
export function VoirTamponsApp({ code, activationInitiale }: VoirTamponsAppProps) {
  const [activation, setActivation] = useState(activationInitiale);
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function activer() {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/fidelite/activer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Email invalide.");
        return;
      }
      setActivation(data);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 text-center">
      <p className="text-4xl">🎉</p>
      <h1 className="text-xl font-bold text-black">Commande bien reçue{activation.prenom ? `, ${activation.prenom}` : ""} !</h1>

      {!activation.emailConnu ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-[#FFF8F0] p-4 text-left">
          <p className="text-sm font-semibold text-gray-900">
            Entre ton email pour débloquer l&apos;accès à tes tampons fidélité.
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="ton@email.com"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
          {erreur && <p className="text-xs font-semibold text-red-600">{erreur}</p>}
          <button
            type="button"
            onClick={activer}
            disabled={enCours || !email.trim()}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {enCours ? "…" : "Voir mes tampons"}
          </button>
          <p className="text-xs text-gray-500">Jamais de spam — juste de quoi te prévenir quand une récompense est prête.</p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-[#FFF8F0] p-4">
          <p className="text-2xl tracking-widest text-[#8B2020]">{rendreTampons(activation.tamponsAffiches)}</p>
          <p className="text-sm font-semibold text-gray-900">
            {activation.tamponsAffiches} tampon{activation.tamponsAffiches > 1 ? "s" : ""}
          </p>
          {activation.recompenseDisponible && (
            <p className="text-sm font-bold text-[#2D5A27]">🎁 Récompense disponible — 10€ offerts !</p>
          )}
        </div>
      )}

      <a href="/commander" className="inline-block text-sm font-semibold text-[#8B2020] underline">
        Commander à nouveau
      </a>
    </div>
  );
}
