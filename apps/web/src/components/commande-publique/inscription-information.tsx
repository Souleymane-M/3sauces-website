"use client";

import { useState } from "react";

/**
 * Formulaire de la page « fermé » : l'email sert à prévenir de la réouverture ; la case « offres » est
 * facultative et décochée par défaut (RGPD : consentement distinct, libre, jamais pré-coché).
 */
export function InscriptionInformation() {
  const [email, setEmail] = useState("");
  const [accepteOffres, setAccepteOffres] = useState(false);
  // Champ piège invisible pour les humains (anti-robots).
  const [siteWeb, setSiteWeb] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [inscrit, setInscrit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      const reponse = await fetch("/api/inscription-information", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accepteOffres, siteWeb }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Inscription impossible, réessayez dans un instant.");
        return;
      }
      setInscrit(true);
    } catch {
      setErreur("Connexion impossible, réessayez dans un instant.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (inscrit) {
    return (
      <div className="rounded-xl border-2 border-[#2D5A27] bg-white p-5 text-center">
        <p className="text-lg font-extrabold text-gray-900">Merci !</p>
        <p className="mt-1 text-base text-gray-800">Nous vous écrirons dès la réouverture de 3 Sauces.</p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="space-y-3 rounded-xl border border-gray-300 bg-white p-5 text-left">
      <h3 className="text-lg font-extrabold text-gray-900">Être prévenu de la réouverture</h3>
      <div>
        <label htmlFor="email-inscription" className="text-sm font-semibold text-gray-900">
          Votre adresse email
        </label>
        <input
          id="email-inscription"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className="mt-1 w-full rounded-lg border border-gray-400 bg-white p-3 text-base text-gray-900"
        />
      </div>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input tabIndex={-1} autoComplete="off" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-900">
        <input
          type="checkbox"
          checked={accepteOffres}
          onChange={(e) => setAccepteOffres(e.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 accent-[#8B2020]"
        />
        <span>Je souhaite aussi recevoir les offres et actualités de 3 Sauces par email.</span>
      </label>

      <p className="text-xs leading-relaxed text-gray-700">
        Votre adresse sert à vous prévenir de la réouverture et, si vous cochez la case, à vous envoyer nos offres.
        Vous pouvez vous désinscrire à tout moment (lien dans chaque email). Responsable du traitement : 3 Sauces.{" "}
        <a href="/confidentialite" className="font-semibold underline">
          Politique de confidentialité
        </a>
        .
      </p>

      {erreur && <p className="rounded-lg bg-red-100 p-3 text-sm font-bold text-red-900">{erreur}</p>}

      <button
        type="submit"
        disabled={envoiEnCours}
        className="w-full rounded-xl bg-[#8B2020] py-3 text-base font-extrabold text-white disabled:opacity-50"
      >
        {envoiEnCours ? "Envoi…" : "Me prévenir"}
      </button>
    </form>
  );
}
