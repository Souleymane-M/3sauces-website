"use client";

import { useEffect, useRef, useState } from "react";
import type { Canal, StatutCommande } from "@3sauces/supabase";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";

const INTERVALLE_POLLING_MS = 5000;

interface LigneRestreinte {
  nom: string;
  quantite: number;
}

interface CommandeCuisineRestreinte {
  id: string;
  numero: number;
  canal: Canal;
  statut: StatutCommande;
  lignes: LigneRestreinte[];
  heureSouhaitee: string | null;
  creeLe: string;
  statutChangeLe: string | null;
}

// Colonne "En cours de livraison" — jamais de montant, nom, téléphone ni
// adresse (cf. `/api/equipe/cuisine/commandes`). Lecture seule : le
// relâchement/l'annulation d'une livraison en cours se fait depuis le
// COMPTOIR ("Remettre en attente de livreur" / "Annuler (avec motif)"),
// jamais depuis cuisine.
interface LivraisonEnCoursRestreinte {
  id: string;
  numero: number;
  lignes: LigneRestreinte[];
  heureSouhaitee: string | null;
  creeLe: string;
  livreurNom: string;
  alerteSignalee: boolean;
  alerteNote: string | null;
  alerteSignaleeLe: string | null;
}

function jourMayotte(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
}

function minutesDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function resumeLignes(lignes: LigneRestreinte[]): string {
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function CuisineView({ profilId, seuilAlerteMin }: { profilId: string; seuilAlerteMin: number }) {
  const [commandes, setCommandes] = useState<CommandeCuisineRestreinte[]>([]);
  const [enLivraison, setEnLivraison] = useState<LivraisonEnCoursRestreinte[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const enVol = useRef(false);

  async function charger() {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/equipe/cuisine/commandes");
      if (res.ok) {
        const data = await res.json();
        setCommandes(data.commandes);
        setEnLivraison(data.enLivraison ?? []);
      }
    } finally {
      enVol.current = false;
    }
  }

  useEffect(() => {
    charger();
    const intervalle = setInterval(charger, INTERVALLE_POLLING_MS);
    return () => clearInterval(intervalle);
  }, []);

  async function marquerEnPreparation(commandeId: string) {
    setEnCours(commandeId);
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/cuisine/statut", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeIds: [commandeId], statut: "en_preparation", profilId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        return;
      }
      await charger();
    } finally {
      setEnCours(null);
    }
  }

  async function marquerPretes() {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    setEnCours("lot");
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/cuisine/statut", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeIds: ids, statut: "pret", profilId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        return;
      }
      setSelection(new Set());
      await charger();
    } finally {
      setEnCours(null);
    }
  }

  function basculerSelection(id: string) {
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  const colonnes: { titre: string; statut: StatutCommande }[] = [
    { titre: "En attente", statut: "en_attente" },
    { titre: "En préparation", statut: "en_preparation" },
    { titre: "Prête", statut: "pret" },
  ];
  const aujourdhui = dateMayotteIso();

  return (
    <div className="mt-4">
      {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}
      {selection.size > 0 && (
        <button
          type="button"
          onClick={marquerPretes}
          disabled={enCours === "lot"}
          className="mb-4 rounded bg-[#2D5A27] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Marquer prêtes ({selection.size})
        </button>
      )}
      <div className="flex flex-col gap-6 lg:flex-row">
        {colonnes.map((col) => {
          const liste = commandes.filter((c) => c.statut === col.statut);
          return (
            <div key={col.statut} className="flex-1">
              <h2 className="mb-2 text-sm font-bold uppercase text-gray-500">
                {col.titre} ({liste.length})
              </h2>
              <div className="space-y-3">
                {liste.map((c) => {
                  const ancienne = jourMayotte(c.creeLe) !== aujourdhui;
                  const minutesEtape = minutesDepuis(c.statutChangeLe ?? c.creeLe);
                  const enRetard = !ancienne && minutesEtape >= seuilAlerteMin;
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border-2 p-3 ${
                        ancienne
                          ? "border-red-600"
                          : enRetard
                            ? "bordure-urgence-clignotante border-red-600"
                            : "border-gray-200"
                      }`}
                    >
                      {enRetard && (
                        <div className="bandeau-urgence-clignotant mb-2 rounded px-2 py-1 text-sm font-bold text-white">
                          🚨 Depuis {minutesEtape} min dans cette étape
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-black">
                            #{String(c.numero).padStart(4, "0")} —{" "}
                            {c.canal === "livraison" ? "Livraison" : c.canal === "sur_place" ? "Sur place" : "À emporter"}
                          </p>
                          <p className="text-sm text-gray-700">{resumeLignes(c.lignes)}</p>
                        </div>
                        {col.statut === "en_preparation" && (
                          <input
                            type="checkbox"
                            checked={selection.has(c.id)}
                            onChange={() => basculerSelection(c.id)}
                            className="mt-1 h-5 w-5"
                            aria-label="Sélectionner pour marquer prête"
                          />
                        )}
                      </div>
                      {col.statut === "pret" && c.canal === "livraison" && (
                        <p className="mt-2 text-xs font-semibold text-[#8B2020]">📦 Reçu sur le sac</p>
                      )}
                      {col.statut === "en_attente" && (
                        <button
                          type="button"
                          onClick={() => marquerEnPreparation(c.id)}
                          disabled={enCours === c.id}
                          className="mt-2 w-full rounded bg-black py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          En préparation
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex-1">
          <h2 className="mb-2 text-sm font-bold uppercase text-gray-500">En cours de livraison ({enLivraison.length})</h2>
          <div className="space-y-3">
            {enLivraison.map((l) => (
              <div
                key={l.id}
                className={`rounded-lg border-2 p-3 ${l.alerteSignalee ? "border-orange-500" : "border-gray-200"}`}
              >
                {l.alerteSignalee && (
                  <div className="mb-2 rounded bg-orange-100 p-2 text-sm font-semibold text-orange-800">
                    🚨 Livreur signale un problème — préviens le comptoir
                    {l.alerteSignaleeLe && ` (${formaterHeure(l.alerteSignaleeLe)})`}
                  </div>
                )}
                <p className="font-bold text-black">#{String(l.numero).padStart(4, "0")}</p>
                <p className="text-sm text-gray-700">{resumeLignes(l.lignes)}</p>
                <p className="mt-1 text-xs text-gray-500">Livreur : {l.livreurNom}</p>
              </div>
            ))}
            {enLivraison.length === 0 && <p className="text-sm text-gray-400">Aucune.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
