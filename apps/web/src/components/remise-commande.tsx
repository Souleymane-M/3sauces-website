"use client";

import { useState } from "react";

export interface ChoixRemise {
  modePaiementReel?: "especes" | "cb" | "mixte";
  paiements?: { mode: "especes" | "cb"; montant: number }[];
  imprimerTicketClient: boolean;
}

interface RemiseCommandeProps {
  numero: number;
  montant: number;
  /** Déjà payée (en ligne ou encaissée à la prise de commande) : pas de question sur le paiement. */
  dejaPayee: boolean;
  /** Le ticket client est déjà sorti : pas de question sur le ticket. */
  ticketClientImprime: boolean;
  enCours: boolean;
  onValider: (choix: ChoixRemise) => void;
  onFermer: () => void;
}

/** La remise d'une commande sur place ou à emporter demande maintenant comment le client a RÉELLEMENT payé et s'il veut son ticket. */
export function remiseDemandeDesChoix(c: { canal: string; modePaiement: string | null; dejaPayee: boolean; ticketClientImprime: boolean }): boolean {
  if (c.canal === "livraison") return false;
  const paiementAFaire = !c.dejaPayee && c.modePaiement !== "stripe";
  return paiementAFaire || !c.ticketClientImprime;
}

export function RemiseCommande({ numero, montant, dejaPayee, ticketClientImprime, enCours, onValider, onFermer }: RemiseCommandeProps) {
  const [mode, setMode] = useState<"especes" | "cb" | "mixte" | null>(null);
  const [especes, setEspeces] = useState("");
  const [ticket, setTicket] = useState<boolean | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const demandePaiement = !dejaPayee;
  const demandeTicket = !ticketClientImprime;

  function valider() {
    setErreur(null);
    if (demandePaiement && mode === null) return setErreur("Indique comment le client a payé.");
    if (demandeTicket && ticket === null) return setErreur("Indique si le client veut son ticket.");
    let paiements: ChoixRemise["paiements"];
    if (demandePaiement && mode === "mixte") {
      const montantEspeces = Number(especes.replace(",", "."));
      if (!Number.isFinite(montantEspeces) || montantEspeces < 0 || montantEspeces > montant) {
        return setErreur("Montant en espèces invalide.");
      }
      const carte = Math.round((montant - montantEspeces) * 100) / 100;
      paiements = [
        ...(montantEspeces > 0 ? [{ mode: "especes" as const, montant: montantEspeces }] : []),
        ...(carte > 0 ? [{ mode: "cb" as const, montant: carte }] : []),
      ];
    }
    onValider({ modePaiementReel: demandePaiement ? (mode ?? undefined) : undefined, paiements, imprimerTicketClient: demandeTicket && ticket === true });
  }

  const bouton = (actif: boolean) =>
    `rounded border py-2 text-sm font-bold ${actif ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 bg-white text-gray-800"}`;

  return (
    <div className="mt-2 space-y-3 rounded border-2 border-[#2D5A27] bg-gray-50 p-3">
      <p className="text-sm font-extrabold text-black">
        Remise de la commande #{String(numero).padStart(4, "0")} — {montant.toFixed(2)} €
      </p>

      {demandePaiement && (
        <div>
          <p className="text-sm font-semibold text-gray-800">Comment le client a-t-il payé ?</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setMode("especes")} className={bouton(mode === "especes")}>
              Espèces
            </button>
            <button type="button" onClick={() => setMode("cb")} className={bouton(mode === "cb")}>
              Carte
            </button>
            <button type="button" onClick={() => setMode("mixte")} className={bouton(mode === "mixte")}>
              Mixte
            </button>
          </div>
          {mode === "mixte" && (
            <div className="mt-2 space-y-1">
              <input
                type="text"
                inputMode="decimal"
                value={especes}
                onChange={(e) => setEspeces(e.target.value)}
                placeholder="Montant en espèces (le reste en carte)"
                aria-label="Montant payé en espèces"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
              />
              {especes.trim() !== "" && Number.isFinite(Number(especes.replace(",", "."))) && (
                <p className="text-sm text-gray-700">Carte : {(montant - Number(especes.replace(",", "."))).toFixed(2)} €</p>
              )}
            </div>
          )}
        </div>
      )}

      {demandeTicket && (
        <div>
          <p className="text-sm font-semibold text-gray-800">Le client veut-il son ticket ?</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTicket(true)} className={bouton(ticket === true)}>
              Oui, imprimer
            </button>
            <button type="button" onClick={() => setTicket(false)} className={bouton(ticket === false)}>
              Non
            </button>
          </div>
        </div>
      )}

      {erreur && <p className="rounded border-2 border-red-600 bg-red-50 p-2 text-sm font-bold text-red-800">⚠️ {erreur}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={valider}
          disabled={enCours}
          className="rounded bg-[#2D5A27] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Valider la remise
        </button>
        <button type="button" onClick={onFermer} className="text-sm text-gray-600 underline">
          Fermer
        </button>
      </div>
    </div>
  );
}
