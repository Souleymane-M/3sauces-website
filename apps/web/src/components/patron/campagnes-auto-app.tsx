"use client";

import { useEffect, useState } from "react";

type Mode = "points" | "recompense" | "relance" | "tous";

interface Campagne {
  jourSemaine: number;
  actif: boolean;
  mode: Mode;
  joursInactivite: number;
  sujet: string;
  message: string;
  etiquette: string;
  dernierEnvoiLe: string | null;
  dernierNbEnvoyes: number | null;
  dernierNbEchecs: number | null;
}

const NOM_JOUR: Record<number, string> = { 1: "Lundi", 3: "Mercredi", 5: "Vendredi" };
const CIBLES: { valeur: Mode; libelle: string }[] = [
  { valeur: "points", libelle: "Clients qui ont au moins 1 point de fidélité" },
  { valeur: "tous", libelle: "Tous les clients qui ont déjà commandé" },
  { valeur: "relance", libelle: "Clients qui ne commandent plus depuis X jours" },
  { valeur: "recompense", libelle: "Clients qui ont une récompense disponible" },
];

const jourFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Envois automatiques du lundi, du mercredi et du vendredi vers 8 h 30 (Mayotte). Chaque jour a son texte, sa cible
 * et son interrupteur. Rien ne part tant que l'interrupteur est coupé ; « Tout couper » arrête tout d'un clic.
 */
export function CampagnesAutoApp() {
  const [campagnes, setCampagnes] = useState<Campagne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch("/api/patron/campagnes-auto")
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (annule) return;
        if (!ok) setErreur(data.error ?? "Chargement impossible.");
        else setCampagnes(data.campagnes);
      })
      .catch(() => !annule && setErreur("Chargement impossible."));
    return () => {
      annule = true;
    };
  }, []);

  function modifier(jour: number, changements: Partial<Campagne>) {
    setCampagnes((liste) => liste?.map((c) => (c.jourSemaine === jour ? { ...c, ...changements } : c)) ?? null);
  }

  return (
    <section className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-gray-900">Envois automatiques (lundi, mercredi, vendredi)</h2>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm("Couper tous les envois automatiques ?")) return;
            const r = await fetch("/api/patron/campagnes-auto", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toutDesactiver: true }),
            });
            if (r.ok) setCampagnes((l) => l?.map((c) => ({ ...c, actif: false })) ?? null);
            else setErreur("Impossible de tout couper, réessaie.");
          }}
          className="ml-auto rounded border border-red-700 px-3 py-1.5 text-sm font-bold text-red-700"
        >
          Tout couper
        </button>
      </div>
      <p className="text-sm text-gray-700">
        L&apos;e-mail part tout seul vers 8 h 30, heure de Mayotte. Jamais un jour où le site est fermé, jamais deux fois le même jour à la
        même personne, avec lien de désinscription.
      </p>
      {erreur && <p className="text-sm font-bold text-red-700">{erreur}</p>}
      {campagnes?.map((c) => (
        <CarteJour key={c.jourSemaine} campagne={c} onChange={(ch) => modifier(c.jourSemaine, ch)} />
      ))}
    </section>
  );
}

function CarteJour({ campagne: c, onChange }: { campagne: Campagne; onChange: (ch: Partial<Campagne>) => void }) {
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [adresseTest, setAdresseTest] = useState("");
  const [enCours, setEnCours] = useState(false);
  const id = `campagne-${c.jourSemaine}`;

  async function enregistrer(actif: boolean) {
    setErreur(null);
    setEtat(null);
    setEnCours(true);
    try {
      const r = await fetch("/api/patron/campagnes-auto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, actif }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      onChange({ actif });
      setEtat(actif ? "Enregistré : cet envoi est ACTIF." : "Enregistré : cet envoi est coupé.");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerTest() {
    setErreur(null);
    setEtat(null);
    setEnCours(true);
    try {
      const r = await fetch("/api/patron/relance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: c.mode, jours: c.joursInactivite, sujet: c.sujet, message: c.message, campagne: c.etiquette, test: adresseTest }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Envoi du test impossible.");
      setEtat(`Test envoyé à ${adresseTest}.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi du test impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className={`space-y-3 rounded-lg border-2 p-3 ${c.actif ? "border-[#2D5A27]" : "border-gray-300"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-bold text-gray-900">{NOM_JOUR[c.jourSemaine]}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.actif ? "bg-[#2D5A27] text-white" : "bg-gray-200 text-gray-700"}`}>
          {c.actif ? "Actif" : "Coupé"}
        </span>
        {c.dernierEnvoiLe && (
          <span className="text-xs text-gray-700">
            Dernier envoi : {jourFr(c.dernierEnvoiLe)} · {c.dernierNbEnvoyes ?? 0} envoyé(s)
            {c.dernierNbEchecs ? ` · ${c.dernierNbEchecs} échec(s)` : ""}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-cible`} className="text-xs font-semibold text-gray-900">
          Qui reçoit
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={`${id}-cible`}
            value={c.mode}
            onChange={(e) => onChange({ mode: e.target.value as Mode })}
            className="rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          >
            {CIBLES.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
          {c.mode === "relance" && (
            <input
              type="number"
              min={1}
              max={365}
              value={c.joursInactivite}
              onChange={(e) => onChange({ joursInactivite: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
              aria-label="Nombre de jours sans commande"
              className="w-20 rounded border border-gray-300 p-2 text-center text-sm text-gray-900"
            />
          )}
        </div>
      </div>

      <input
        id={`${id}-sujet`}
        value={c.sujet}
        onChange={(e) => onChange({ sujet: e.target.value })}
        placeholder="Sujet de l'e-mail"
        maxLength={150}
        aria-label="Sujet"
        className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
      />
      <textarea
        id={`${id}-message`}
        value={c.message}
        onChange={(e) => onChange({ message: e.target.value })}
        rows={7}
        maxLength={3000}
        placeholder="Message (utilise {prenom}, {fidelite} ou {pointsfidelite} pour personnaliser)"
        aria-label="Message"
        className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
      />
      <div className="space-y-1">
        <label htmlFor={`${id}-etiquette`} className="text-xs font-semibold text-gray-900">
          Étiquette de suivi (d&apos;où viennent les commandes)
        </label>
        <input
          id={`${id}-etiquette`}
          value={c.etiquette}
          onChange={(e) => onChange({ etiquette: e.target.value })}
          maxLength={34}
          className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => enregistrer(true)}
          disabled={enCours}
          className="rounded bg-[#2D5A27] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Enregistrer et activer
        </button>
        <button
          type="button"
          onClick={() => enregistrer(false)}
          disabled={enCours}
          className="rounded border border-gray-400 px-3 py-2 text-sm font-bold text-gray-900 disabled:opacity-40"
        >
          Enregistrer sans activer
        </button>
        <input
          value={adresseTest}
          onChange={(e) => setAdresseTest(e.target.value)}
          placeholder="Mon adresse (test)"
          aria-label="Adresse pour un test"
          className="ml-auto rounded border border-gray-300 p-2 text-sm text-gray-900"
        />
        <button
          type="button"
          onClick={envoyerTest}
          disabled={enCours || !adresseTest.trim() || !c.sujet.trim() || !c.message.trim()}
          className="rounded border border-gray-400 px-3 py-2 text-sm font-bold text-gray-900 disabled:opacity-40"
        >
          Envoyer un test
        </button>
      </div>
      {etat && <p className="text-sm font-semibold text-[#2D5A27]">{etat}</p>}
      {erreur && <p className="text-sm font-bold text-red-700">{erreur}</p>}
    </div>
  );
}
