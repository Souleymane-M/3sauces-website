"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine } from "@/lib/cuisine/types";
import type { ProduitCaisse, ViandeCaisse, SauceCaisse, SaveurCaisse } from "@/lib/caisse/types";
import type { ParametresLivraisonPublic } from "@/lib/commande-publique/types";
import type { LivraisonAEncaisser } from "@/lib/encaissements-livraison-types";
import { formaterTelephoneAffichage } from "@/lib/telephone";
import { CaisseApp } from "@/components/caisse/caisse-app";
import { EncaissementsLivraisonCaisse } from "@/components/caisse/encaissements-livraison-caisse";
import { ConfirmationPin } from "./confirmation-pin";
import { FinServiceView } from "./fin-service-view";

const INTERVALLE_POLLING_MS = 5000;

function resumeLignes(lignes: CommandeCuisine["lignes"]): string {
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

interface Catalogue {
  produits: ProduitCaisse[];
  viandes: ViandeCaisse[];
  sauces: SauceCaisse[];
  saveurs: SaveurCaisse[];
  parfums2l: SaveurCaisse[];
  parametres: ParametresLivraisonPublic;
  livraisonsAEncaisser: LivraisonAEncaisser[];
}

type Vue = "liste" | "nouvelle_commande" | "encaissements" | "fin_service";

/**
 * Vue COMPTOIR : montants et coordonnées client visibles (nécessaires
 * pour encaisser/remettre), "Remise" et "Annuler" (en attente uniquement,
 * refusé côté serveur sinon). La prise de nouvelle commande et les
 * encaissements réutilisent `CaisseApp`/`EncaissementsLivraisonCaisse` —
 * mêmes composants que `/caisse`, jamais une deuxième implémentation.
 */
export function ComptoirView({ profilId, nom }: { profilId: string; nom: string }) {
  const [commandes, setCommandes] = useState<CommandeCuisine[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [annulationEnAttente, setAnnulationEnAttente] = useState<string | null>(null);
  const [vue, setVue] = useState<Vue>("liste");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [chargementCatalogue, setChargementCatalogue] = useState(false);
  const enVol = useRef(false);

  async function charger() {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/equipe/comptoir/commandes");
      if (res.ok) {
        const data = await res.json();
        setCommandes(data.commandes);
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

  async function ouvrirVueAvecCatalogue(cible: "nouvelle_commande" | "encaissements") {
    if (!catalogue) {
      setChargementCatalogue(true);
      try {
        const res = await fetch("/api/equipe/comptoir/catalogue");
        if (!res.ok) {
          setErreur("Impossible de charger le catalogue.");
          return;
        }
        setCatalogue(await res.json());
      } finally {
        setChargementCatalogue(false);
      }
    }
    setVue(cible);
  }

  async function appliquer(commandeId: string, action: "remise" | "annuler") {
    setEnCours(commandeId);
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/comptoir/action", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, action, profilId }),
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

  if (vue === "fin_service") {
    return <FinServiceView profilId={profilId} onFermer={() => setVue("liste")} />;
  }

  if (vue === "nouvelle_commande" && catalogue) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setVue("liste")} className="mb-3 text-sm text-gray-500 underline">
          ← Retour à la liste
        </button>
        <CaisseApp
          produits={catalogue.produits}
          viandes={catalogue.viandes}
          sauces={catalogue.sauces}
          saveurs={catalogue.saveurs}
          parfums2l={catalogue.parfums2l}
          parametres={catalogue.parametres}
          nomEmploye={nom}
        />
      </div>
    );
  }

  if (vue === "encaissements" && catalogue) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setVue("liste")} className="mb-3 text-sm text-gray-500 underline">
          ← Retour à la liste
        </button>
        <EncaissementsLivraisonCaisse livraisonsInitiales={catalogue.livraisonsAEncaisser} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => ouvrirVueAvecCatalogue("nouvelle_commande")}
          disabled={chargementCatalogue}
          className="rounded bg-[#8B2020] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          + Nouvelle commande
        </button>
        <button
          type="button"
          onClick={() => ouvrirVueAvecCatalogue("encaissements")}
          disabled={chargementCatalogue}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          Encaissements{catalogue && catalogue.livraisonsAEncaisser.length > 0 ? ` (${catalogue.livraisonsAEncaisser.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setVue("fin_service")}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
        >
          Fin de service
        </button>
      </div>
      {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}
      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-black">
                  #{String(c.numero).padStart(4, "0")} — {c.nom}
                </p>
                <p className="text-sm text-gray-700">{resumeLignes(c.lignes)}</p>
                {c.telephone && <p className="text-sm text-gray-500">{formaterTelephoneAffichage(c.telephone)}</p>}
                {c.adresse && <p className="text-sm text-gray-500">{c.adresse}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-black">{c.montant.toFixed(2)} €</p>
                <p className="text-xs text-gray-500">{c.statut === "pret" ? "Prête" : c.statut}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              {c.statut === "pret" && c.canal !== "livraison" && (
                <button
                  type="button"
                  onClick={() => appliquer(c.id, "remise")}
                  disabled={enCours === c.id}
                  className="rounded bg-[#2D5A27] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Remise
                </button>
              )}
              {c.statut === "en_attente" && (
                <button
                  type="button"
                  onClick={() => setAnnulationEnAttente(c.id)}
                  disabled={enCours === c.id}
                  className="rounded border border-red-600 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        ))}
        {commandes.length === 0 && <p className="text-center text-gray-500">Aucune commande active.</p>}
      </div>

      {annulationEnAttente && (
        <ConfirmationPin
          titre="Confirmer l'annulation"
          onAnnule={() => setAnnulationEnAttente(null)}
          onConfirme={() => {
            const id = annulationEnAttente;
            setAnnulationEnAttente(null);
            appliquer(id, "annuler");
          }}
        />
      )}
    </div>
  );
}
