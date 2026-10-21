"use client";

import { useState } from "react";
import type { ActivationFidelite } from "@/lib/fidelite/activation";
import { NB_TAMPONS_RECOMPENSE } from "@/lib/fidelite/regles";

interface VoirTamponsAppProps {
  code: string;
}

type Etape = "telephone" | "email" | "tampons";

/** Tampons pleins/vides sur la base de 10 — ex: 13 tampons → ●●●●●●●●●● (+3), même rendu que le ticket imprimé. */
function rendreTampons(nombre: number): string {
  const surDix = nombre % NB_TAMPONS_RECOMPENSE || (nombre > 0 ? NB_TAMPONS_RECOMPENSE : 0);
  const pleins = "●".repeat(surDix);
  const vides = "○".repeat(NB_TAMPONS_RECOMPENSE - surDix);
  const supplement = nombre > NB_TAMPONS_RECOMPENSE ? ` (+${nombre - surDix})` : "";
  return `${pleins}${vides}${supplement}`;
}

/**
 * Page atteinte en scannant le QR du reçu une fois la commande livrée. Le
 * ticket reste agrafé au sachet jusqu'à la livraison — n'importe qui
 * pourrait le scanner, pas forcément le client lui-même. Donc d'abord une
 * vérification du téléphone renseigné à la commande (jamais de prénom ni
 * de tampon affiché avant ça), puis seulement si l'email n'est pas déjà
 * connu, une demande d'email pour débloquer l'affichage — objectif
 * explicite du patron, 2026-10-21 : sécuriser l'accès ET récupérer un
 * maximum d'emails.
 */
export function VoirTamponsApp({ code }: VoirTamponsAppProps) {
  const [etape, setEtape] = useState<Etape>("telephone");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [activation, setActivation] = useState<ActivationFidelite | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function verifierTelephone() {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/fidelite/verifier-telephone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, telephone }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Numéro incorrect.");
        return;
      }
      setActivation(data);
      setEtape(data.emailConnu ? "tampons" : "email");
    } finally {
      setEnCours(false);
    }
  }

  async function activerEmail() {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/fidelite/activer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, telephone, email }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Email invalide.");
        return;
      }
      setActivation(data);
      setEtape("tampons");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 text-center">
      <p className="text-4xl">🎉</p>
      <h1 className="text-xl font-bold text-black">
        Commande bien reçue{etape === "tampons" || etape === "email" ? (activation?.prenom ? `, ${activation.prenom}` : "") : ""} !
      </h1>

      {etape === "telephone" && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-[#FFF8F0] p-4 text-left">
          <p className="text-sm font-semibold text-gray-900">
            Pour confirmer que c&apos;est bien toi, entre le numéro de téléphone renseigné à la commande.
          </p>
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="0639123456"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
          {erreur && <p className="text-xs font-semibold text-red-600">{erreur}</p>}
          <button
            type="button"
            onClick={verifierTelephone}
            disabled={enCours || !telephone.trim()}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {enCours ? "…" : "Continuer"}
          </button>
        </div>
      )}

      {etape === "email" && (
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
            onClick={activerEmail}
            disabled={enCours || !email.trim()}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {enCours ? "…" : "Voir mes tampons"}
          </button>
          <p className="text-xs text-gray-500">Jamais de spam — juste de quoi te prévenir quand une récompense est prête.</p>
        </div>
      )}

      {etape === "tampons" && activation && (
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
