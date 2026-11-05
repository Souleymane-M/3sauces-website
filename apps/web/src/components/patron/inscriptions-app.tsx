"use client";

import { useMemo, useState } from "react";
import type { InscriptionAdmin } from "@/lib/patron/inscriptions";

type Filtre = "tous" | "offres" | "reouverture" | "desinscrits";
type Cible = "reouverture" | "offres";

const jourMayotte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

const MESSAGE_REOUVERTURE = "Bonne nouvelle : 3 Sauces rouvre ! Retrouvez nos grillades, tacos et plats du jour sur 3sauces.fr.\n\nÀ très vite !";

/**
 * Inscrits via le formulaire de la page « fermé » : qui a coché la case « offres » (étiquette verte) et qui
 * veut seulement être prévenu de la réouverture (étiquette grise), export CSV, et envoi à la main d'un email.
 */
export function InscriptionsApp({ inscriptionsInitiales }: { inscriptionsInitiales: InscriptionAdmin[] }) {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<Cible>("reouverture");
  const [sujet, setSujet] = useState("3 Sauces rouvre !");
  const [message, setMessage] = useState(MESSAGE_REOUVERTURE);
  const [adresseTest, setAdresseTest] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const actifs = inscriptionsInitiales.filter((i) => !i.desinscritLe);
  const avecOffres = actifs.filter((i) => i.accepteOffres);
  const reouvertureSeule = actifs.filter((i) => !i.accepteOffres);
  const desinscrits = inscriptionsInitiales.filter((i) => i.desinscritLe);
  const nbCible = cible === "offres" ? avecOffres.length : actifs.length;

  const affichees = useMemo(() => {
    const base =
      filtre === "offres" ? avecOffres : filtre === "reouverture" ? reouvertureSeule : filtre === "desinscrits" ? desinscrits : inscriptionsInitiales;
    const requete = recherche.trim().toLowerCase();
    return requete ? base.filter((i) => i.email.includes(requete)) : base;
  }, [filtre, recherche, inscriptionsInitiales, avecOffres, reouvertureSeule, desinscrits]);

  async function appeler(corps: Record<string, unknown>) {
    const reponse = await fetch("/api/patron/inscriptions/envoyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cible, sujet, message, ...corps }),
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
    if (nbCible === 0) return;
    const libelle = cible === "offres" ? "ont accepté les offres" : "sont inscrits";
    if (!window.confirm(`Envoyer cet email à ${nbCible} personne${nbCible > 1 ? "s" : ""} qui ${libelle} ? Cette action est définitive.`)) return;
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
      <h2 className="text-lg font-bold text-gray-900">Emails collectés (page « fermé »)</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Inscrits actifs", actifs.length, "text-gray-900"],
          ["Ont accepté les offres", avecOffres.length, "text-[#2D5A27]"],
          ["Réouverture seulement", reouvertureSeule.length, "text-gray-900"],
          ["Désinscrits", desinscrits.length, "text-gray-600"],
        ].map(([libelle, n, couleur]) => (
          <div key={libelle as string} className="rounded-lg border border-gray-200 p-3">
            <p className={`text-2xl font-extrabold ${couleur}`}>{n}</p>
            <p className="text-xs font-semibold text-gray-700">{libelle}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["tous", "Tous"],
            ["offres", "Ont accepté les offres"],
            ["reouverture", "Réouverture seulement"],
            ["desinscrits", "Désinscrits"],
          ] as const
        ).map(([valeur, libelle]) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setFiltre(valeur)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              filtre === valeur ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-800"
            }`}
          >
            {libelle}
          </button>
        ))}
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un email"
          className="ml-auto rounded border border-gray-300 px-3 py-1 text-sm text-gray-900"
        />
        <a href="/api/patron/inscriptions/export" className="rounded bg-[#2D5A27] px-3 py-1.5 text-sm font-bold text-white">
          Exporter (CSV)
        </a>
      </div>

      <div className="max-h-72 overflow-y-auto rounded border border-gray-200">
        {affichees.length === 0 ? (
          <p className="p-3 text-sm text-gray-700">Aucune inscription pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-700">
              <tr>
                <th className="p-2">Email</th>
                <th className="p-2">Choix</th>
                <th className="p-2">Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {affichees.map((i) => (
                <tr key={i.id} className="border-t border-gray-100 text-gray-900">
                  <td className="p-2">{i.email}</td>
                  <td className="p-2">
                    {i.desinscritLe ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">Désinscrit</span>
                    ) : i.accepteOffres ? (
                      <span className="rounded-full bg-[#2D5A27] px-2 py-0.5 text-xs font-bold text-white">Réouverture + offres</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Réouverture seulement</span>
                    )}
                  </td>
                  <td className="p-2">{jourMayotte(i.consentementLe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-300 p-3">
        <h3 className="font-bold text-gray-900">Envoyer un email</h3>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <input type="radio" checked={cible === "reouverture"} onChange={() => setCible("reouverture")} />
            Réouverture : tous les inscrits actifs ({actifs.length})
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <input type="radio" checked={cible === "offres"} onChange={() => setCible("offres")} />
            Offres : uniquement ceux qui ont accepté les offres ({avecOffres.length})
          </label>
        </div>
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
          rows={6}
          maxLength={3000}
          className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
        />
        <p className="text-xs text-gray-700">Un lien « Me désinscrire » est ajouté automatiquement à chaque email.</p>
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
            disabled={enCours || nbCible === 0 || !sujet.trim() || !message.trim()}
            className="ml-auto rounded bg-[#8B2020] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Envoyer à {nbCible} personne{nbCible > 1 ? "s" : ""}
          </button>
        </div>
        {etat && <p className="text-sm font-semibold text-[#2D5A27]">{etat}</p>}
        {erreur && <p className="text-sm font-bold text-red-700">{erreur}</p>}
      </div>
    </section>
  );
}
