"use client";

import { useState } from "react";

/** Un clic de confirmation (jamais de désinscription automatique au simple chargement du lien : certains lecteurs d'email l'ouvrent seuls). */
export function DesinscriptionApp({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<"attente" | "envoi" | "fait" | "erreur">("attente");

  async function confirmer() {
    setEtat("envoi");
    try {
      const reponse = await fetch("/api/inscription-information/desinscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton }),
      });
      setEtat(reponse.ok ? "fait" : "erreur");
    } catch {
      setEtat("erreur");
    }
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-xl border border-gray-300 bg-white p-6 text-center">
      <h1 className="text-2xl font-extrabold text-gray-900">Désinscription</h1>
      {etat === "fait" ? (
        <p className="text-base text-gray-800">C&apos;est fait : vous ne recevrez plus d&apos;emails de 3 Sauces. Merci et à bientôt !</p>
      ) : (
        <>
          <p className="text-base text-gray-800">Confirmez-vous ne plus vouloir recevoir les emails de 3 Sauces ?</p>
          {etat === "erreur" && <p className="text-sm font-bold text-red-800">Lien invalide ou erreur : réessayez, ou contactez-nous au 06 39 63 81 78.</p>}
          <button
            type="button"
            onClick={confirmer}
            disabled={etat === "envoi" || !jeton}
            className="w-full rounded-xl bg-[#8B2020] py-3 text-base font-extrabold text-white disabled:opacity-50"
          >
            {etat === "envoi" ? "…" : "Me désinscrire"}
          </button>
        </>
      )}
    </div>
  );
}
