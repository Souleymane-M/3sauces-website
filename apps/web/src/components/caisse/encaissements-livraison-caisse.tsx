"use client";

import { useState } from "react";
import type { LivraisonAEncaisser } from "@/lib/encaissements-livraison-types";

interface EncaissementsLivraisonCaisseProps {
  livraisonsInitiales: LivraisonAEncaisser[];
}

function formaterDateHeure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function libelleMode(mode: string): string {
  return mode === "cb" ? "Carte" : "Espèces";
}

/**
 * Même donnée et même API que components/patron/encaissements-livraison-app.tsx
 * (contrôle à distance) — ici en thème clair pour le responsable de caisse
 * qui valide sur place, après contrôle, au retour du livreur.
 */
export function EncaissementsLivraisonCaisse({ livraisonsInitiales }: EncaissementsLivraisonCaisseProps) {
  const [livraisons, setLivraisons] = useState<LivraisonAEncaisser[]>(livraisonsInitiales);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [noteEcart, setNoteEcart] = useState<Record<string, string>>({});
  const [signalementOuvert, setSignalementOuvert] = useState<string | null>(null);

  async function appeler(commandeId: string, body: Record<string, unknown>) {
    setErreur(null);
    setEnCours(commandeId);
    try {
      const reponse = await fetch("/api/encaissements-livraison", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, ...body }),
      });
      const data = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de l'opération.");
        return false;
      }
      return true;
    } finally {
      setEnCours(null);
    }
  }

  async function valider(livraison: LivraisonAEncaisser) {
    const precedentes = livraisons;
    setLivraisons((prec) => prec.filter((l) => l.id !== livraison.id));
    const ok = await appeler(livraison.id, { action: "valider" });
    if (!ok) setLivraisons(precedentes);
  }

  async function signalerEcart(livraison: LivraisonAEncaisser) {
    const note = (noteEcart[livraison.id] ?? "").trim();
    if (!note) {
      setErreur("Décris l'écart constaté.");
      return;
    }
    const ok = await appeler(livraison.id, { action: "signaler_ecart", note });
    if (ok) {
      setLivraisons((prec) => prec.map((l) => (l.id === livraison.id ? { ...l, alerteSignalee: true, alerteNote: note } : l)));
      setSignalementOuvert(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Le livreur déclare ce qu&apos;il a récupéré depuis son écran — contrôle et valide chaque livraison ici.
      </p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      {livraisons.length === 0 && <p className="text-lg text-gray-400">Aucune livraison en attente d&apos;encaissement.</p>}

      <ul className="space-y-3">
        {livraisons.map((l) => (
          <li key={l.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">
                  Commande #{l.numero} — {l.nom || "?"}
                </p>
                <p className="text-sm text-gray-500">
                  {l.adresse} — {formaterDateHeure(l.creeLe)}
                </p>
              </div>
              <span className="text-lg font-bold text-gray-900">{l.montant.toFixed(2)} €</span>
            </div>

            {l.alerteSignalee && (
              <p className="mt-2 text-sm text-orange-600">⚠️ Écart signalé : {l.alerteNote}</p>
            )}

            {l.statutPaiement === "non_paye" ? (
              <p className="mt-3 text-sm text-gray-400">En attente de livraison — le livreur n&apos;a pas encore déclaré.</p>
            ) : (
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <ul className="text-sm text-gray-700">
                  {l.paiementsDeclares.map((p, i) => (
                    <li key={i}>
                      {libelleMode(p.mode)} : {p.montant.toFixed(2)} €{p.payeur ? ` — ${p.payeur}` : ""}
                    </li>
                  ))}
                </ul>

                {signalementOuvert === l.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={noteEcart[l.id] ?? ""}
                      onChange={(e) => setNoteEcart((prec) => ({ ...prec, [l.id]: e.target.value }))}
                      placeholder="Décris l'écart…"
                      className="flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900"
                    />
                    <button
                      onClick={() => signalerEcart(l)}
                      disabled={enCours === l.id}
                      className="rounded border border-orange-400 px-3 py-2 text-sm font-semibold text-orange-600 disabled:opacity-40"
                    >
                      Envoyer
                    </button>
                    <button onClick={() => setSignalementOuvert(null)} className="text-sm text-gray-500 underline">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSignalementOuvert(l.id)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    >
                      Signaler un écart
                    </button>
                    <button
                      onClick={() => valider(l)}
                      disabled={enCours === l.id}
                      className="ml-auto rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Valider
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
