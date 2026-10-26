"use client";

import { useEffect, useState } from "react";
import { COUPURES_CENTIMES, type Billetage, type EtatTiroir } from "@/lib/caisse/tiroir-types";

interface Bilan {
  fonds: number | null;
  encaisseEspeces: number;
  sorties: number;
  attendu: number;
  mixteSansDetail: number;
}

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

function totalSaisie(saisie: Record<string, string>): number {
  let centimes = 0;
  for (const c of COUPURES_CENTIMES) centimes += c.valeur * (parseInt(saisie[String(c.valeur)] ?? "", 10) || 0);
  return centimes / 100;
}

function versBilletage(saisie: Record<string, string>): Billetage {
  const detail: Billetage = {};
  for (const c of COUPURES_CENTIMES) {
    const n = parseInt(saisie[String(c.valeur)] ?? "", 10) || 0;
    if (n > 0) detail[String(c.valeur)] = n;
  }
  return detail;
}

function GrilleComptage({ saisie, onChange }: { saisie: Record<string, string>; onChange: (s: Record<string, string>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {COUPURES_CENTIMES.map((c) => (
        <label key={c.valeur} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2">
          <span className="text-sm font-semibold text-gray-800">{c.libelle}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={saisie[String(c.valeur)] ?? ""}
            placeholder="0"
            onChange={(e) => onChange({ ...saisie, [String(c.valeur)]: e.target.value })}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-lg text-black"
          />
        </label>
      ))}
    </div>
  );
}

type Mode = "accueil" | "ouverture" | "sortie" | "cloture";

function libelleRecomptages(n: number): string {
  return n > 0 ? ` · recompté ${n} fois (le patron voit tous les comptages)` : "";
}

export function TiroirCaisseApp({ onFermer }: { onFermer?: () => void }) {
  const [etat, setEtat] = useState<EtatTiroir | null>(null);
  const [mode, setMode] = useState<Mode>("accueil");
  const [recomptage, setRecomptage] = useState(false);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [montantSortie, setMontantSortie] = useState("");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ bilan: Bilan; compte: number } | null>(null);

  useEffect(() => {
    let annule = false;
    fetch("/api/caisse/tiroir")
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (d.etat) setEtat(d.etat);
        else setErreur(d.error ?? "Chargement impossible.");
      })
      .catch(() => {
        if (!annule) setErreur("Chargement impossible.");
      });
    return () => {
      annule = true;
    };
  }, []);

  async function envoyer(corps: Record<string, unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/caisse/tiroir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const d = await res.json();
      if (!res.ok) {
        setErreur(d.error ?? "Échec de l'enregistrement.");
        return;
      }
      setEtat(d.etat);
      if (d.bilan) setResultat({ bilan: d.bilan, compte: d.compte });
      setSaisie({});
      setMontantSortie("");
      setMotif("");
      setMode("accueil");
      setRecomptage(false);
    } catch {
      setErreur("Échec de l'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  function annulerSaisie() {
    setMode("accueil");
    setRecomptage(false);
    setSaisie({});
    setErreur(null);
  }

  if (!etat) {
    return <p className="mt-6 text-gray-500">{erreur ?? "Chargement…"}</p>;
  }

  const total = totalSaisie(saisie);
  const montantNum = Number(montantSortie.replace(",", "."));

  if (mode === "ouverture" || mode === "cloture") {
    const ouverture = mode === "ouverture";
    return (
      <div className="mt-4 space-y-3">
        <h2 className="text-xl font-bold text-black">
          {recomptage ? "Recomptage — " : ""}
          {ouverture ? "Fonds de caisse (début de service)" : "Comptage de fin de journée"}
        </h2>
        {recomptage && (
          <p className="rounded bg-orange-50 p-2 text-sm text-orange-800">
            Le comptage précédent est conservé dans l&apos;historique et sera barré. Recompte tout depuis le début.
          </p>
        )}
        <p className="text-sm text-gray-600">
          {ouverture
            ? "Compte tout ce qui est dans le tiroir avant d'ouvrir. Saisis le nombre de chaque billet et pièce."
            : "Compte tout ce qui est dans le tiroir, fonds de départ compris. Le résultat s'affiche après validation."}
        </p>
        <GrilleComptage saisie={saisie} onChange={setSaisie} />
        <p className="text-right text-xl font-bold text-black">Total compté : {euros(total)}</p>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={annulerSaisie} className="rounded border border-gray-300 px-4 py-2 font-semibold text-gray-700">
            Annuler
          </button>
          <button
            type="button"
            disabled={enCours || (ouverture && total <= 0)}
            onClick={() => {
              const texte = `${ouverture ? "Enregistrer le fonds de caisse" : "Valider le comptage"} : ${euros(total)} ?`;
              if (window.confirm(texte)) {
                envoyer({ action: recomptage ? `recompter_${mode}` : mode, detail: versBilletage(saisie) });
              }
            }}
            className="flex-1 rounded bg-[#8B2020] px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : ouverture ? "Enregistrer le fonds de caisse" : "Valider le comptage"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "sortie") {
    const valide = Number.isFinite(montantNum) && montantNum > 0 && motif.trim().length >= 3;
    return (
      <div className="mt-4 space-y-3">
        <h2 className="text-xl font-bold text-black">Sortie de caisse</h2>
        <p className="text-sm text-gray-600">Argent retiré du tiroir (courses, remboursement…). Le motif est obligatoire.</p>
        <input
          type="text"
          inputMode="decimal"
          value={montantSortie}
          onChange={(e) => setMontantSortie(e.target.value)}
          placeholder="Montant en €"
          className="w-full rounded border border-gray-300 px-3 py-2 text-lg text-black"
        />
        <input
          type="text"
          value={motif}
          maxLength={200}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Motif (ex : courses pain)"
          className="w-full rounded border border-gray-300 px-3 py-2 text-lg text-black"
        />
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={annulerSaisie} className="rounded border border-gray-300 px-4 py-2 font-semibold text-gray-700">
            Annuler
          </button>
          <button
            type="button"
            disabled={enCours || !valide}
            onClick={() => {
              if (window.confirm(`Sortie de ${euros(montantNum)} — ${motif.trim()} ?`)) {
                envoyer({ action: "sortie", montant: montantNum, motif: motif.trim() });
              }
            }}
            className="flex-1 rounded bg-[#8B2020] px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer la sortie"}
          </button>
        </div>
      </div>
    );
  }

  const cloture = etat.cloture;
  return (
    <div className="mt-4 space-y-4">
      {onFermer && (
        <button type="button" onClick={onFermer} className="text-sm text-gray-500 underline">
          ← Retour
        </button>
      )}
      <h2 className="text-xl font-bold text-black">Tiroir-caisse</h2>

      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-600">Fonds de caisse</p>
        {etat.ouverture ? (
          <>
            <p className="text-lg font-bold text-black">
              {euros(etat.ouverture.montant)} <span className="text-sm font-normal text-gray-500">à {heure(etat.ouverture.creeLe)}, par {etat.ouverture.profilNom}{libelleRecomptages(etat.recomptages.ouverture)}</span>
            </p>
            {!cloture && (
              <button
                type="button"
                onClick={() => {
                  setRecomptage(true);
                  setMode("ouverture");
                }}
                className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
              >
                Je me suis trompé / recompter
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-orange-700">Pas encore enregistré aujourd&apos;hui.</p>
            {!cloture && (
              <button type="button" onClick={() => setMode("ouverture")} className="mt-2 rounded bg-[#8B2020] px-4 py-2 font-bold text-white">
                Compter le fonds de caisse
              </button>
            )}
          </>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-600">Sorties de caisse</p>
        {etat.sorties.length === 0 && <p className="text-gray-500">Aucune.</p>}
        <ul className="divide-y divide-gray-100">
          {etat.sorties.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 py-1 text-sm text-black">
              <span>
                {heure(s.creeLe)} — {s.motif}
              </span>
              <span className="font-semibold">− {euros(s.montant)}</span>
            </li>
          ))}
        </ul>
        {!cloture && (
          <button type="button" onClick={() => setMode("sortie")} className="mt-2 rounded border border-gray-300 px-4 py-2 font-semibold text-gray-700">
            + Sortie de caisse
          </button>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-600">Clôture de la journée</p>
        {cloture ? (
          <div className="mt-1 space-y-1 text-black">
            <p>
              Attendu : <b>{euros(resultat?.bilan.attendu ?? cloture.attendu ?? 0)}</b>
            </p>
            <p>
              Compté : <b>{euros(resultat?.compte ?? cloture.montant)}</b>
            </p>
            <p className={(cloture.ecart ?? 0) === 0 ? "font-bold text-green-700" : "font-bold text-red-700"}>
              Écart : {(cloture.ecart ?? 0) > 0 ? "+" : ""}
              {euros(cloture.ecart ?? 0)}
              {(cloture.ecart ?? 0) === 0 ? " — caisse juste" : (cloture.ecart ?? 0) > 0 ? " (trop perçu)" : " (manque)"}
            </p>
            {resultat && resultat.bilan.mixteSansDetail > 0 && (
              <p className="text-sm text-orange-700">
                ⚠ {resultat.bilan.mixteSansDetail} commande(s) payée(s) en mixte sans détail espèces : l&apos;attendu peut être inexact.
              </p>
            )}
            {!etat.ouverture && <p className="text-sm text-orange-700">⚠ Pas de fonds de caisse enregistré : il compte pour 0.</p>}
            <p className="text-xs text-gray-500">
              Clôturé à {heure(cloture.creeLe)} par {cloture.profilNom}{libelleRecomptages(etat.recomptages.cloture)}.
            </p>
            <button
              type="button"
              onClick={() => {
                setRecomptage(true);
                setMode("cloture");
              }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
            >
              Recompter (erreur ou second compteur)
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setMode("cloture")} className="mt-2 rounded bg-[#2D5A27] px-4 py-2 font-bold text-white">
            Faire le comptage de fin de journée
          </button>
        )}
      </div>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
    </div>
  );
}

/** Rappel discret (jamais bloquant) tant que le fonds de caisse du jour n'est pas enregistré. */
export function BandeauFondsCaisse({ onOuvrir }: { onOuvrir: () => void }) {
  const [manquant, setManquant] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch("/api/caisse/tiroir")
      .then((r) => r.json())
      .then((d) => {
        if (!annule && d.etat) setManquant(!d.etat.ouverture && !d.etat.cloture);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  if (!manquant) return null;
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="mb-3 w-full rounded border border-orange-300 bg-orange-50 px-3 py-2 text-left text-sm font-semibold text-orange-800"
    >
      Fonds de caisse non enregistré aujourd&apos;hui — appuie ici pour le compter
    </button>
  );
}
