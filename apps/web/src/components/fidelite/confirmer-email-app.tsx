"use client";

import { useState } from "react";

type Etat = "attente" | "encours" | "ok" | "deja_active" | "expire" | "invalide";

/** Bouton explicite (et non une validation à l'ouverture du lien) : un antivirus ou un lecteur d'emails qui « visite » le lien ne doit jamais activer le compte à la place du client. */
export function ConfirmerEmailApp({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>(jeton ? "attente" : "invalide");

  async function confirmer() {
    setEtat("encours");
    try {
      const reponse = await fetch("/api/fidelite/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      const data = (await reponse.json().catch(() => null)) as { resultat?: Etat } | null;
      setEtat(data?.resultat ?? "invalide");
    } catch {
      setEtat("invalide");
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-4 text-center">
      <p className="text-4xl">🎁</p>
      <h1 className="text-xl font-bold text-black">Confirme ton email</h1>
      {(etat === "attente" || etat === "encours") && (
        <>
          <p className="text-sm text-gray-800">Un dernier clic pour activer ton compte fidélité 3 Sauces et débloquer tes récompenses.</p>
          <button
            type="button"
            onClick={confirmer}
            disabled={etat === "encours"}
            className="w-full rounded bg-[#8B2020] py-3 text-base font-bold text-white disabled:opacity-40"
          >
            {etat === "encours" ? "…" : "Confirmer mon email"}
          </button>
        </>
      )}
      {(etat === "ok" || etat === "deja_active") && (
        <p className="rounded-lg border-2 border-[#2D5A27] bg-[#2D5A27]/10 p-4 text-base font-bold text-[#2D5A27]">
          ✅ {etat === "ok" ? "C'est fait : ton compte fidélité est activé." : "Ton compte fidélité est déjà activé."} Tu peux utiliser tes récompenses, au restaurant comme sur 3sauces.fr.
        </p>
      )}
      {etat === "expire" && (
        <p className="text-sm font-semibold text-red-700">Ce lien a expiré. Scanne de nouveau le QR de ton ticket pour recevoir un nouvel email.</p>
      )}
      {etat === "invalide" && (
        <p className="text-sm font-semibold text-red-700">Ce lien n&apos;est plus valable. Scanne de nouveau le QR de ton ticket pour recevoir un nouvel email.</p>
      )}
    </div>
  );
}
