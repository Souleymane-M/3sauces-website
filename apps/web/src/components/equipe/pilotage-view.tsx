"use client";

import { useEffect, useRef, useState } from "react";
import type { Canal, RoleMetier } from "@3sauces/supabase";
import type { StatistiquesDurees, SeuilDeuxiemeLivreur, RepartitionMotifs } from "@/lib/patron/statistiques-equipe";
import type { UtilisateurEquipe } from "@/lib/patron/utilisateurs";
import { ProduitsView } from "./produits-view";

type Onglet = "stats" | "parametres" | "utilisateurs" | "produits";

const LIBELLES_MOTIF: Record<string, string> = {
  no_show: "Client non venu (no-show)",
  erreur: "Erreur",
  annulation: "Annulation",
  client_injoignable: "Client injoignable",
};

const LIBELLES_PARAMETRE: Record<string, string> = {
  delai_preparation_standard_min: "Délai de préparation standard (min)",
  seuil_alerte_retard_etape_min: "Seuil alerte « bloquée » en cuisine (min)",
  seuil_retard_2e_livreur_min: "Seuil de retard pour le 2e livreur (min)",
  duree_verrouillage_appareil_sec: "Verrouillage automatique appareil (sec)",
  seuil_tentatives_appareil_partage: "Essais PIN tolérés — appareil partagé",
  seuil_tentatives_appareil_livreur: "Essais PIN tolérés — appareil livreur",
  seuil_tentatives_ip_horaire: "Essais tolérés par IP et par heure",
};

function DureeLigne({ titre, d }: { titre: string; d: { moyenne: number | null; mediane: number | null; n: number } }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2">
      <span className="text-sm text-gray-700">{titre}</span>
      <span className="text-sm font-semibold text-black">
        {d.moyenne !== null ? `${d.moyenne} min (médiane ${d.mediane})` : "—"} <span className="text-gray-400">({d.n})</span>
      </span>
    </div>
  );
}

function StatsSection() {
  const [canal, setCanal] = useState<Canal | "">("");
  const [data, setData] = useState<{
    jour: StatistiquesDurees;
    semaine: StatistiquesDurees;
    seuilDeuxiemeLivreur: SeuilDeuxiemeLivreur;
    motifs: RepartitionMotifs[];
  } | null>(null);

  useEffect(() => {
    const url = canal ? `/api/equipe/pilotage/statistiques?canal=${canal}` : "/api/equipe/pilotage/statistiques";
    fetch(url)
      .then((r) => r.json())
      .then(setData);
  }, [canal]);

  if (!data) return <p className="mt-4 text-gray-500">Chargement…</p>;

  return (
    <div className="mt-4">
      <select value={canal} onChange={(e) => setCanal(e.target.value as Canal | "")} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
        <option value="">Tous les canaux</option>
        <option value="sur_place">Sur place</option>
        <option value="emporter">À emporter</option>
        <option value="livraison">Livraison</option>
      </select>

      {data.seuilDeuxiemeLivreur.seuilAtteint && (
        <div className="mt-4 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700">
          🚨 Seuil 2e livreur atteint — retard moyen &gt; {data.seuilDeuxiemeLivreur.seuilMin} min deux semaines de suite
          ({data.seuilDeuxiemeLivreur.retardSemainePrecedente} min puis {data.seuilDeuxiemeLivreur.retardSemaineCourante} min)
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase text-gray-500">Aujourd&apos;hui ({data.jour.nCommandes} commandes)</h3>
          <DureeLigne titre="Attente en cuisine" d={data.jour.attenteCuisineMin} />
          <DureeLigne titre="Préparation" d={data.jour.preparationMin} />
          <DureeLigne titre="Attente du livreur" d={data.jour.attenteLivreurMin} />
          <DureeLigne titre="Trajet" d={data.jour.trajetMin} />
          <p className="mt-2 text-sm text-gray-700">
            Retard moyen : <strong>{data.jour.retardMoyenMin ?? "—"} min</strong>
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase text-gray-500">Cette semaine ({data.semaine.nCommandes} commandes)</h3>
          <DureeLigne titre="Attente en cuisine" d={data.semaine.attenteCuisineMin} />
          <DureeLigne titre="Préparation" d={data.semaine.preparationMin} />
          <DureeLigne titre="Attente du livreur" d={data.semaine.attenteLivreurMin} />
          <DureeLigne titre="Trajet" d={data.semaine.trajetMin} />
          <p className="mt-2 text-sm text-gray-700">
            Retard moyen : <strong>{data.semaine.retardMoyenMin ?? "—"} min</strong>
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 p-3">
        <h3 className="mb-2 text-sm font-bold uppercase text-gray-500">Motifs de clôture (cette semaine)</h3>
        {data.motifs.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune clôture manuelle.</p>
        ) : (
          data.motifs.map((m) => (
            <div key={m.motif} className="flex justify-between py-1 text-sm">
              <span>{LIBELLES_MOTIF[m.motif] ?? m.motif}</span>
              <span className="font-semibold">{m.nombre}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ParametresSection() {
  const [parametres, setParametres] = useState<{ cle: string; valeur: number; description: string | null }[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/equipe/pilotage/parametres")
      .then((r) => r.json())
      .then((d) => setParametres(d.parametres));
  }, []);

  async function enregistrer(cle: string, valeur: number) {
    setEnCours(cle);
    try {
      await fetch("/api/equipe/pilotage/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle, valeur }),
      });
    } finally {
      setEnCours(null);
    }
  }

  if (!parametres) return <p className="mt-4 text-gray-500">Chargement…</p>;

  return (
    <div className="mt-4 space-y-3">
      {parametres.map((p) => (
        <div key={p.cle} className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3">
          <div>
            <p className="text-sm font-semibold text-black">{LIBELLES_PARAMETRE[p.cle] ?? p.cle}</p>
            {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
          </div>
          <input
            type="number"
            defaultValue={p.valeur}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) enregistrer(p.cle, v);
            }}
            disabled={enCours === p.cle}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-right"
          />
        </div>
      ))}
    </div>
  );
}

function UtilisateursSection() {
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurEquipe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<"employe" | "livreur">("employe");
  const [pin, setPin] = useState("");
  const [rolesChoisis, setRolesChoisis] = useState<Set<RoleMetier>>(new Set());
  const enVol = useRef(false);

  async function charger() {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/equipe/pilotage/utilisateurs");
      if (res.ok) setUtilisateurs((await res.json()).utilisateurs);
    } finally {
      enVol.current = false;
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function creer() {
    setErreur(null);
    const res = await fetch("/api/equipe/pilotage/utilisateurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, role, pin, rolesMetier: Array.from(rolesChoisis) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error ?? "Erreur.");
      return;
    }
    setNom("");
    setPin("");
    setRolesChoisis(new Set());
    setFormulaireOuvert(false);
    await charger();
  }

  async function basculerActif(id: string, actif: boolean) {
    await fetch(`/api/equipe/pilotage/utilisateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif }),
    });
    await charger();
  }

  async function reinitialiserPin(id: string) {
    const nouveauPin = window.prompt("Nouveau PIN (4 à 6 chiffres) :");
    if (!nouveauPin) return;
    const res = await fetch(`/api/equipe/pilotage/utilisateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: nouveauPin }),
    });
    if (!res.ok) setErreur((await res.json()).error ?? "Erreur.");
  }

  async function basculerRole(id: string, actuels: RoleMetier[], role: RoleMetier) {
    const suivant = actuels.includes(role) ? actuels.filter((r) => r !== role) : [...actuels, role];
    await fetch(`/api/equipe/pilotage/utilisateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rolesMetier: suivant }),
    });
    await charger();
  }

  if (!utilisateurs) return <p className="mt-4 text-gray-500">Chargement…</p>;

  return (
    <div className="mt-4">
      {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}
      <button
        type="button"
        onClick={() => setFormulaireOuvert((v) => !v)}
        className="mb-3 rounded bg-black px-3 py-1.5 text-sm font-semibold text-white"
      >
        {formulaireOuvert ? "Annuler" : "+ Nouvel utilisateur"}
      </button>

      {formulaireOuvert && (
        <div className="mb-4 space-y-2 rounded border border-gray-200 p-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="w-full rounded border border-gray-300 px-2 py-1.5" />
          <select value={role} onChange={(e) => setRole(e.target.value as "employe" | "livreur")} className="w-full rounded border border-gray-300 px-2 py-1.5">
            <option value="employe">Employé</option>
            <option value="livreur">Livreur</option>
          </select>
          {role === "employe" && (
            <div className="flex gap-3">
              {(["cuisine", "comptoir", "produits"] as const).map((r) => (
                <label key={r} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={rolesChoisis.has(r)}
                    onChange={() =>
                      setRolesChoisis((prev) => {
                        const suivant = new Set(prev);
                        if (suivant.has(r)) suivant.delete(r);
                        else suivant.add(r);
                        return suivant;
                      })
                    }
                  />
                  {r === "cuisine" ? "Cuisine" : r === "comptoir" ? "Comptoir" : "Produits"}
                </label>
              ))}
            </div>
          )}
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN (4 à 6 chiffres)" className="w-full rounded border border-gray-300 px-2 py-1.5" />
          <button type="button" onClick={creer} className="rounded bg-[#2D5A27] px-3 py-1.5 text-sm font-semibold text-white">
            Créer
          </button>
        </div>
      )}

      <div className="space-y-2">
        {utilisateurs.map((u) => (
          <div key={u.id} className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-black">
                {u.nom} <span className="text-xs text-gray-500">({u.role})</span>
              </p>
              <div className="flex gap-2">
                {u.role !== "patron" && (
                  <button type="button" onClick={() => reinitialiserPin(u.id)} className="text-xs text-gray-500 underline">
                    Réinitialiser PIN
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => basculerActif(u.id, !u.actif)}
                  className={`text-xs underline ${u.actif ? "text-red-600" : "text-[#2D5A27]"}`}
                >
                  {u.actif ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </div>
            {u.role === "employe" && (
              <div className="mt-1 flex gap-3">
                {(["cuisine", "comptoir", "produits"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={u.rolesMetier.includes(r)} onChange={() => basculerRole(u.id, u.rolesMetier, r)} />
                    {r === "cuisine" ? "Cuisine" : r === "comptoir" ? "Comptoir" : "Produits"}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PilotageView() {
  const [onglet, setOnglet] = useState<Onglet>("stats");

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        {([
          ["stats", "Statistiques"],
          ["parametres", "Paramètres"],
          ["utilisateurs", "Utilisateurs"],
          ["produits", "Produits"],
        ] as [Onglet, string][]).map(([valeur, libelle]) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setOnglet(valeur)}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${onglet === valeur ? "bg-black text-white" : "border border-gray-300 text-gray-700"}`}
          >
            {libelle}
          </button>
        ))}
      </div>
      {onglet === "stats" && <StatsSection />}
      {onglet === "parametres" && <ParametresSection />}
      {onglet === "utilisateurs" && <UtilisateursSection />}
      {onglet === "produits" && <ProduitsView />}
    </div>
  );
}
