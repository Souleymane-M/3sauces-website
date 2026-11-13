"use client";

import { useState } from "react";

type Mode = "relance" | "recompense";

interface ClientListe {
  telephone: string;
  email: string;
  prenom: string | null;
  nbCommandes: number;
  joursDepuis: number | null;
  recompenses: number;
  phrase: string;
}

const MODELES: Record<Mode, { sujet: string; message: string }> = {
  relance: {
    sujet: "Ça fait un moment chez 3 Sauces !",
    message:
      "Bonjour {prenom},\n\nÇa fait un moment qu'on ne t'a pas vu chez 3 Sauces, et tes grillades et tes tacos te manquent peut-être aussi !\n\n{fidelite}\n\nÀ très vite sur 3sauces.fr.",
  },
  recompense: {
    sujet: "Tu as des récompenses chez 3 Sauces",
    message:
      "Bonjour {prenom},\n\n{fidelite}\n\nCommande quand tu veux sur 3sauces.fr, par téléphone ou au comptoir : c'est toi qui décides quand les utiliser.\n\nMerci de ta fidélité !",
  },
};

/**
 * Relance des clients qui ont un email : soit ceux qui ne commandent plus depuis X jours, soit ceux qui ont une
 * récompense disponible. Envoi à la main, par lots, avec lien de désinscription ; `{prenom}` et `{fidelite}`
 * sont remplacés pour chaque client (tampons manquants, ou récompense disponible avec sa date limite).
 */
export function RelanceApp() {
  const [mode, setMode] = useState<Mode>("relance");
  const [jours, setJours] = useState(14);
  const [sujet, setSujet] = useState(MODELES.relance.sujet);
  const [message, setMessage] = useState(MODELES.relance.message);
  const [clients, setClients] = useState<ClientListe[] | null>(null);
  const [adresseTest, setAdresseTest] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function changerMode(m: Mode) {
    setMode(m);
    setSujet(MODELES[m].sujet);
    setMessage(MODELES[m].message);
    setClients(null);
    setEtat(null);
    setErreur(null);
  }

  async function charger() {
    setErreur(null);
    setEtat(null);
    setEnCours(true);
    try {
      const reponse = await fetch(`/api/patron/relance?mode=${mode}&jours=${jours}`);
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(data.error ?? "Chargement impossible.");
      setClients(data.clients);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  async function appeler(corps: Record<string, unknown>) {
    const reponse = await fetch("/api/patron/relance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, jours, sujet, message, ...corps }),
    });
    const data = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(data.error ?? "Envoi impossible.");
    return data;
  }

  async function envoyerTest() {
    setErreur(null);
    setEtat(null);
    setEnCours(true);
    try {
      await appeler({ test: adresseTest });
      setEtat(`Email de test envoyé à ${adresseTest}.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerATous() {
    const nb = clients?.length ?? 0;
    if (nb === 0) return;
    if (!window.confirm(`Envoyer cet email à ${nb} client${nb > 1 ? "s" : ""} ? Cette action est définitive.`)) return;
    setErreur(null);
    setEtat(null);
    setEnCours(true);
    let debut: number | null = 0;
    let envoyes = 0;
    const echecs: string[] = [];
    try {
      while (debut !== null) {
        const data: { total: number; envoyes: number; echecs: string[]; suivant: number | null } = await appeler({ debut });
        envoyes += data.envoyes;
        echecs.push(...data.echecs);
        debut = data.suivant;
        setEtat(`Envoi en cours : ${envoyes} sur ${data.total}…`);
      }
      setEtat(`Terminé : ${envoyes} email(s) envoyé(s)${echecs.length ? `, ${echecs.length} échec(s) : ${echecs.join(", ")}` : ""}.`);
    } catch (e) {
      setErreur(`${e instanceof Error ? e.message : "Envoi interrompu."} (${envoyes} déjà envoyé(s) — ne relancez pas sans vérifier.)`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-bold text-gray-900">Relancer mes clients</h2>
      <p className="text-sm text-gray-700">
        Clients qui ont donné un email en commandant. Personne n&apos;est relancé s&apos;il s&apos;est désinscrit. Rien ne part tant que tu
        n&apos;as pas cliqué sur « Envoyer ».
      </p>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <input type="radio" checked={mode === "relance"} onChange={() => changerMode("relance")} />
          Clients qui ne commandent plus depuis
          <input
            type="number"
            min={1}
            max={365}
            value={jours}
            onChange={(e) => {
              setJours(Math.max(1, Math.min(365, Number(e.target.value) || 1)));
              setClients(null);
            }}
            className="w-16 rounded border border-gray-300 p-1 text-center text-sm text-gray-900"
          />
          jours
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <input type="radio" checked={mode === "recompense"} onChange={() => changerMode("recompense")} />
          Clients qui ont une récompense disponible
        </label>
      </div>

      <button
        type="button"
        onClick={charger}
        disabled={enCours}
        className="rounded bg-[#2D5A27] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
      >
        Voir la liste
      </button>

      {clients && (
        <div className="max-h-72 overflow-y-auto rounded border border-gray-200">
          {clients.length === 0 ? (
            <p className="p-3 text-sm text-gray-700">Aucun client ne correspond.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-700">
                <tr>
                  <th className="p-2">Client</th>
                  <th className="p-2">Commandes</th>
                  <th className="p-2">Dernière</th>
                  <th className="p-2">Message fidélité</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.telephone} className="border-t border-gray-100 align-top text-gray-900">
                    <td className="p-2">
                      {c.prenom ?? "—"}
                      <br />
                      <span className="text-xs text-gray-700">{c.email}</span>
                    </td>
                    <td className="p-2">{c.nbCommandes}</td>
                    <td className="p-2">{c.joursDepuis === null ? "—" : `il y a ${c.joursDepuis} j`}</td>
                    <td className="p-2 text-xs">{c.phrase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-gray-300 p-3">
        <h3 className="font-bold text-gray-900">Message</h3>
        <input
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
          placeholder="Sujet"
          maxLength={150}
          className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          maxLength={3000}
          className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
        />
        <p className="text-xs text-gray-700">
          {"{prenom}"} = prénom du client · {"{fidelite}"} = sa situation (récompense disponible, ou tampons qui lui manquent). Un lien « Me
          désinscrire » est ajouté automatiquement à chaque email.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={adresseTest}
            onChange={(e) => setAdresseTest(e.target.value)}
            placeholder="Mon adresse (pour un test)"
            className="rounded border border-gray-300 p-2 text-sm text-gray-900"
          />
          <button
            type="button"
            onClick={envoyerTest}
            disabled={enCours || !adresseTest.trim() || !sujet.trim() || !message.trim()}
            className="rounded border border-gray-400 px-3 py-2 text-sm font-bold text-gray-900 disabled:opacity-40"
          >
            Envoyer un test
          </button>
          <button
            type="button"
            onClick={envoyerATous}
            disabled={enCours || !clients || clients.length === 0 || !sujet.trim() || !message.trim()}
            className="ml-auto rounded bg-[#8B2020] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Envoyer à {clients?.length ?? 0} client{(clients?.length ?? 0) > 1 ? "s" : ""}
          </button>
        </div>
        {etat && <p className="text-sm font-semibold text-[#2D5A27]">{etat}</p>}
        {erreur && <p className="text-sm font-bold text-red-700">{erreur}</p>}
      </div>
    </section>
  );
}
