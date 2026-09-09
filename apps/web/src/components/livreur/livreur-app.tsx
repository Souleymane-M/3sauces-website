"use client";

import { useState } from "react";
import type { ModePaiement } from "@3sauces/supabase";
import type { LivraisonAssignee } from "@/lib/livreur/types";

interface LivreurAppProps {
  livraisonsInitiales: LivraisonAssignee[];
}

interface PaiementGroupe {
  mode: ModePaiement;
  montant: string;
  payeur: string;
}

interface DeclarationEnCours {
  mode: "simple" | "groupe";
  choixSimple: "especes" | "cb" | "mixte" | null;
  montantRecu: string;
  montantEspecesMixte: string;
  paiementsGroupes: PaiementGroupe[];
}

function declarationVide(): DeclarationEnCours {
  return {
    mode: "simple",
    choixSimple: null,
    montantRecu: "",
    montantEspecesMixte: "",
    paiementsGroupes: [{ mode: "especes", montant: "", payeur: "" }],
  };
}

function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function LivreurApp({ livraisonsInitiales }: LivreurAppProps) {
  const [livraisons, setLivraisons] = useState<LivraisonAssignee[]>(livraisonsInitiales);
  const [declarationsOuvertes, setDeclarationsOuvertes] = useState<Record<string, DeclarationEnCours>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function ouvrirDeclaration(commandeId: string) {
    setErreur(null);
    setDeclarationsOuvertes((prec) => ({ ...prec, [commandeId]: declarationVide() }));
  }

  function fermerDeclaration(commandeId: string) {
    setDeclarationsOuvertes((prec) => {
      const suite = { ...prec };
      delete suite[commandeId];
      return suite;
    });
  }

  function modifierDeclaration(commandeId: string, changement: Partial<DeclarationEnCours>) {
    setDeclarationsOuvertes((prec) => ({ ...prec, [commandeId]: { ...prec[commandeId], ...changement } }));
  }

  async function envoyer(livraison: LivraisonAssignee, paiements: { mode: ModePaiement; montant: number; payeur?: string }[]) {
    setErreur(null);
    setEnCours(livraison.id);
    try {
      const reponse = await fetch("/api/livreur/declarer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: livraison.id, paiements }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec de la déclaration.");
        return;
      }
      setLivraisons((prec) => prec.filter((l) => l.id !== livraison.id));
      fermerDeclaration(livraison.id);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnCours(null);
    }
  }

  function soumettreSimple(livraison: LivraisonAssignee, declaration: DeclarationEnCours) {
    const attendu = livraison.montant;
    if (declaration.choixSimple === "especes") {
      envoyer(livraison, [{ mode: "especes", montant: attendu }]);
    } else if (declaration.choixSimple === "cb") {
      envoyer(livraison, [{ mode: "cb", montant: attendu }]);
    } else if (declaration.choixSimple === "mixte") {
      const especes = Number(declaration.montantEspecesMixte.replace(",", "."));
      if (!Number.isFinite(especes) || especes < 0 || especes > attendu) {
        setErreur("Montant espèces invalide.");
        return;
      }
      const cb = Math.round((attendu - especes) * 100) / 100;
      const paiements: { mode: ModePaiement; montant: number }[] = [];
      if (especes > 0) paiements.push({ mode: "especes", montant: especes });
      if (cb > 0) paiements.push({ mode: "cb", montant: cb });
      if (paiements.length === 0) {
        setErreur("Renseigne au moins un montant.");
        return;
      }
      envoyer(livraison, paiements);
    }
  }

  function soumettreGroupe(livraison: LivraisonAssignee, declaration: DeclarationEnCours) {
    const paiements: { mode: ModePaiement; montant: number; payeur?: string }[] = [];
    for (const p of declaration.paiementsGroupes) {
      const montant = Number(p.montant.replace(",", "."));
      if (!Number.isFinite(montant) || montant <= 0) {
        setErreur("Chaque paiement doit avoir un montant valide.");
        return;
      }
      paiements.push({ mode: p.mode, montant, payeur: p.payeur.trim() || undefined });
    }
    envoyer(livraison, paiements);
  }

  return (
    <div className="mt-4 space-y-4">
      {erreur && <p className="text-lg text-red-600">{erreur}</p>}
      {livraisons.length === 0 && <p className="text-xl text-gray-400">Aucune livraison en cours.</p>}

      {livraisons.map((livraison) => {
        const declaration = declarationsOuvertes[livraison.id];
        const totalGroupeDeclare = declaration
          ? Math.round(
              declaration.paiementsGroupes.reduce((total, p) => total + (Number(p.montant.replace(",", ".")) || 0), 0) * 100
            ) / 100
          : 0;
        const totalGroupeCorrespond = declaration && totalGroupeDeclare === Math.round(livraison.montant * 100) / 100;

        return (
          <div key={livraison.id} className="rounded-xl border-2 border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-gray-900">Commande #{livraison.numero}</span>
              <span className="text-xl text-gray-900">{formaterHeure(livraison.heureSouhaitee)}</span>
            </div>
            <p className="mt-1 text-lg text-gray-900">{livraison.nom}</p>
            <p className="text-lg text-gray-700">{livraison.adresse}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{livraison.montant.toFixed(2)} € à récupérer</p>

            {!declaration && (
              <button
                onClick={() => ouvrirDeclaration(livraison.id)}
                className="mt-4 w-full rounded bg-[#8B2020] py-3 text-xl font-bold text-white"
              >
                Livré
              </button>
            )}

            {declaration && declaration.mode === "simple" && (
              <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  {(["especes", "cb", "mixte"] as const).map((choix) => (
                    <button
                      key={choix}
                      onClick={() => modifierDeclaration(livraison.id, { choixSimple: choix })}
                      className={`rounded border py-2 text-sm font-bold uppercase ${
                        declaration.choixSimple === choix
                          ? "border-[#8B2020] bg-[#8B2020] text-white"
                          : "border-gray-300 text-gray-700"
                      }`}
                    >
                      {choix === "especes" ? "Espèces" : choix === "cb" ? "Carte" : "Espèces + Carte"}
                    </button>
                  ))}
                </div>

                {declaration.choixSimple === "especes" && (
                  <div>
                    <label className="text-sm text-gray-500">Montant reçu</label>
                    <input
                      value={declaration.montantRecu}
                      onChange={(e) => modifierDeclaration(livraison.id, { montantRecu: e.target.value })}
                      inputMode="decimal"
                      placeholder={livraison.montant.toFixed(2)}
                      className="mt-1 w-full rounded border border-gray-300 p-3 text-lg text-gray-900"
                    />
                    {(() => {
                      const recu = Number(declaration.montantRecu.replace(",", "."));
                      if (!Number.isFinite(recu) || declaration.montantRecu.trim() === "") return null;
                      const rendu = Math.round((recu - livraison.montant) * 100) / 100;
                      return (
                        <p className={`mt-1 text-lg font-semibold ${rendu < 0 ? "text-red-600" : "text-gray-900"}`}>
                          {rendu < 0 ? "Montant insuffisant" : `Rendu : ${rendu.toFixed(2)} €`}
                        </p>
                      );
                    })()}
                  </div>
                )}

                {declaration.choixSimple === "mixte" && (
                  <div>
                    <label className="text-sm text-gray-500">Montant espèces</label>
                    <input
                      value={declaration.montantEspecesMixte}
                      onChange={(e) => modifierDeclaration(livraison.id, { montantEspecesMixte: e.target.value })}
                      inputMode="decimal"
                      className="mt-1 w-full rounded border border-gray-300 p-3 text-lg text-gray-900"
                    />
                    {(() => {
                      const especes = Number(declaration.montantEspecesMixte.replace(",", "."));
                      if (!Number.isFinite(especes) || declaration.montantEspecesMixte.trim() === "") return null;
                      const cb = Math.round((livraison.montant - especes) * 100) / 100;
                      return <p className="mt-1 text-lg font-semibold text-gray-900">Part carte : {cb.toFixed(2)} €</p>;
                    })()}
                  </div>
                )}

                <button
                  onClick={() => modifierDeclaration(livraison.id, { mode: "groupe" })}
                  className="text-sm text-gray-500 underline"
                >
                  Commande groupée (plusieurs payeurs)
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => fermerDeclaration(livraison.id)}
                    className="flex-1 rounded border border-gray-300 py-3 text-lg font-semibold text-gray-700"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => soumettreSimple(livraison, declaration)}
                    disabled={
                      enCours === livraison.id ||
                      !declaration.choixSimple ||
                      (declaration.choixSimple === "especes" &&
                        !(Number(declaration.montantRecu.replace(",", ".")) >= livraison.montant)) ||
                      (declaration.choixSimple === "mixte" &&
                        !(Number(declaration.montantEspecesMixte.replace(",", ".")) >= 0))
                    }
                    className="flex-1 rounded bg-[#8B2020] py-3 text-lg font-bold text-white disabled:opacity-40"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            )}

            {declaration && declaration.mode === "groupe" && (
              <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
                <button
                  onClick={() => modifierDeclaration(livraison.id, { mode: "simple" })}
                  className="text-sm text-gray-500 underline"
                >
                  ← Revenir à un seul payeur
                </button>

                {declaration.paiementsGroupes.map((paiement, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={paiement.mode}
                      onChange={(e) => {
                        const paiements = [...declaration.paiementsGroupes];
                        paiements[index] = { ...paiement, mode: e.target.value as ModePaiement };
                        modifierDeclaration(livraison.id, { paiementsGroupes: paiements });
                      }}
                      className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                    >
                      <option value="especes">Espèces</option>
                      <option value="cb">Carte</option>
                    </select>
                    <input
                      value={paiement.montant}
                      onChange={(e) => {
                        const paiements = [...declaration.paiementsGroupes];
                        paiements[index] = { ...paiement, montant: e.target.value };
                        modifierDeclaration(livraison.id, { paiementsGroupes: paiements });
                      }}
                      inputMode="decimal"
                      placeholder="Montant"
                      className="w-24 rounded border border-gray-300 p-2 text-sm text-gray-900"
                    />
                    <input
                      value={paiement.payeur}
                      onChange={(e) => {
                        const paiements = [...declaration.paiementsGroupes];
                        paiements[index] = { ...paiement, payeur: e.target.value };
                        modifierDeclaration(livraison.id, { paiementsGroupes: paiements });
                      }}
                      placeholder="Qui (optionnel)"
                      className="flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900"
                    />
                    {declaration.paiementsGroupes.length > 1 && (
                      <button
                        onClick={() => {
                          const paiements = declaration.paiementsGroupes.filter((_, i) => i !== index);
                          modifierDeclaration(livraison.id, { paiementsGroupes: paiements });
                        }}
                        className="text-gray-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={() =>
                    modifierDeclaration(livraison.id, {
                      paiementsGroupes: [...declaration.paiementsGroupes, { mode: "especes", montant: "", payeur: "" }],
                    })
                  }
                  className="text-sm text-[#8B2020] underline"
                >
                  + Ajouter un paiement
                </button>

                <p className={`text-lg font-semibold ${totalGroupeCorrespond ? "text-gray-900" : "text-orange-600"}`}>
                  Total déclaré : {totalGroupeDeclare.toFixed(2)} € / {livraison.montant.toFixed(2)} € attendus
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => fermerDeclaration(livraison.id)}
                    className="flex-1 rounded border border-gray-300 py-3 text-lg font-semibold text-gray-700"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => soumettreGroupe(livraison, declaration)}
                    disabled={enCours === livraison.id || !totalGroupeCorrespond}
                    className="flex-1 rounded bg-[#8B2020] py-3 text-lg font-bold text-white disabled:opacity-40"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
