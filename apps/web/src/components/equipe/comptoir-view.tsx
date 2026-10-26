"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine } from "@/lib/cuisine/types";
import type { ProduitCaisse, ViandeCaisse, SauceCaisse, SaveurCaisse } from "@/lib/caisse/types";
import type { ParametresLivraisonPublic } from "@/lib/commande-publique/types";
import type { CommandeAModifier } from "@/lib/caisse/modification";
import type { LivraisonAEncaisser } from "@/lib/encaissements-livraison-types";
import { formaterTelephoneAffichage } from "@/lib/telephone";
import { CaisseApp } from "@/components/caisse/caisse-app";
import { BandeauFondsCaisse, TiroirCaisseApp } from "@/components/caisse/tiroir-caisse-app";
import { EncaissementsLivraisonCaisse } from "@/components/caisse/encaissements-livraison-caisse";
import { EtatSiteApp } from "@/components/patron/etat-site-app";
import { LivraisonActiveApp } from "@/components/patron/livraison-active-app";
import { ConfirmationPin } from "./confirmation-pin";
import { FinServiceView } from "./fin-service-view";

const INTERVALLE_POLLING_MS = 5000;

// Même liste que `STATUTS_MODIFIABLES` (lib/caisse/modification.ts, non
// importable ici — ce fichier est "server-only") : avant qu'une commande
// ne parte vraiment (livreur en main, ou déjà remise), son contenu peut
// encore changer. Demande explicite du patron, 2026-10-19.
const STATUTS_MODIFIABLES = new Set(["en_attente", "en_preparation", "pret"]);

const LIBELLES_CANAL: Record<string, string> = {
  sur_place: "Sur place",
  emporter: "À emporter",
  livraison: "Livraison",
};

const LIBELLES_MOTIF: Record<string, string> = {
  no_show: "Client non venu (no-show)",
  erreur: "Erreur",
  annulation: "Annulation",
  client_injoignable: "Client injoignable",
};

function resumeLignes(lignes: CommandeCuisine["lignes"]): string {
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

function minutesDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
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

type Vue = "liste" | "nouvelle_commande" | "modifier_commande" | "encaissements" | "fin_service" | "tiroir";

/**
 * Vue COMPTOIR : montants et coordonnées client visibles (nécessaires
 * pour encaisser/remettre), "Remise", "Annuler" (en attente, sans motif)
 * et "Annuler (avec motif)" pour une commande déjà en préparation/prête —
 * un client peut rappeler juste au moment où sa commande part en
 * préparation (cas réel, 2026-10-19) : même mécanique que "Fin de
 * service" (motif obligatoire + PIN), juste disponible à tout moment du
 * service plutôt qu'en fin de journée. La prise de nouvelle commande, la
 * modification et les encaissements réutilisent `CaisseApp`/
 * `EncaissementsLivraisonCaisse` — mêmes composants que `/caisse`, jamais
 * une deuxième implémentation.
 */
export function ComptoirView({ profilId, nom, seuilAlerteMin }: { profilId: string; nom: string; seuilAlerteMin: number }) {
  const [commandes, setCommandes] = useState<CommandeCuisine[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [annulationEnAttente, setAnnulationEnAttente] = useState<string | null>(null);
  const [relacherEnAttente, setRelacherEnAttente] = useState<string | null>(null);
  const [annulationAvecMotifPour, setAnnulationAvecMotifPour] = useState<string | null>(null);
  const [motifChoisi, setMotifChoisi] = useState("");
  const [confirmationMotifOuverte, setConfirmationMotifOuverte] = useState(false);
  // Changement du mode de retrait (sur place / à emporter / livraison) d'une commande en cours.
  const [canalEnEdition, setCanalEnEdition] = useState<string | null>(null);
  const [nouveauCanal, setNouveauCanal] = useState<"sur_place" | "emporter" | "livraison" | null>(null);
  const [adresseCanal, setAdresseCanal] = useState("");
  const [zoneCanal, setZoneCanal] = useState("");
  // La caisse (prise de commande) est l'écran le plus utilisé : on y
  // arrive directement en ouvrant Comptoir, exactement comme /caisse
  // seule — demande explicite du patron, 2026-10-25. Les autres écrans
  // (liste/remise/annuler, encaissements, fin de service) restent
  // accessibles via les boutons d'en-tête, jamais supprimés.
  const [vue, setVue] = useState<Vue>("nouvelle_commande");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [chargementCatalogue, setChargementCatalogue] = useState(false);
  const [commandeAModifier, setCommandeAModifier] = useState<CommandeAModifier | null>(null);
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

  async function chargerCatalogue(): Promise<Catalogue | null> {
    // Toujours rechargé (jamais mis en cache) : "à encaisser" change à chaque
    // commande créée, et une catégorie en cache périmée ferait rater une
    // commande fraîchement enregistrée (bug repéré en testant le 2026-10-19 :
    // une commande venait d'être créée, invisible dans "Encaissements" car
    // la liste chargée au tout premier clic n'était jamais rafraîchie).
    setChargementCatalogue(true);
    try {
      const res = await fetch("/api/equipe/comptoir/catalogue");
      if (!res.ok) {
        setErreur("Impossible de charger le catalogue.");
        return null;
      }
      const data = await res.json();
      setCatalogue(data);
      return data;
    } finally {
      setChargementCatalogue(false);
    }
  }

  // Chargé une fois au montage (pas seulement à l'ouverture d'une sous-vue)
  // pour que les interrupteurs Site/Livraison, affichés sur l'écran liste,
  // aient leur état initial dès l'arrivée — demande explicite du patron,
  // 2026-10-25. Fetch direct plutôt que `chargerCatalogue()` : évite le
  // `setChargementCatalogue(true)` synchrone en tête de celle-ci (inutile
  // ici, ce chargement est silencieux, pas un clic utilisateur).
  useEffect(() => {
    let annule = false;
    fetch("/api/equipe/comptoir/catalogue")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !annule) setCatalogue(data);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  async function ouvrirVueAvecCatalogue(cible: "nouvelle_commande" | "encaissements") {
    const data = await chargerCatalogue();
    if (data) setVue(cible);
  }

  async function ouvrirModification(commandeId: string) {
    setErreur(null);
    setChargementCatalogue(true);
    try {
      const [resCatalogue, resCommande] = await Promise.all([
        fetch("/api/equipe/comptoir/catalogue"),
        fetch(`/api/equipe/comptoir/commande/${commandeId}`),
      ]);
      if (!resCatalogue.ok || !resCommande.ok) {
        const data = await resCommande.json().catch(() => null);
        setErreur(data?.error ?? "Impossible de charger la commande à modifier.");
        return;
      }
      setCatalogue(await resCatalogue.json());
      const { commande } = await resCommande.json();
      setCommandeAModifier(commande);
      setVue("modifier_commande");
    } finally {
      setChargementCatalogue(false);
    }
  }

  async function appliquer(commandeId: string, action: "remise" | "annuler" | "relacher_livreur") {
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

  async function appliquerChangementCanal(commandeId: string) {
    if (!nouveauCanal) return;
    setEnCours(commandeId);
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/comptoir/action", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandeId,
          action: "changer_canal",
          profilId,
          canal: nouveauCanal,
          adresse: adresseCanal,
          zone: zoneCanal,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur.");
        return;
      }
      setCanalEnEdition(null);
      await charger();
    } finally {
      setEnCours(null);
    }
  }

  async function annulerAvecMotif(commandeId: string, motif: string) {
    setEnCours(commandeId);
    setErreur(null);
    try {
      const res = await fetch("/api/equipe/comptoir/fin-service", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, motif, profilId }),
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

  if (vue === "tiroir") {
    return <TiroirCaisseApp onFermer={() => setVue("nouvelle_commande")} />;
  }

  if (vue === "fin_service") {
    return <FinServiceView profilId={profilId} onFermer={() => setVue("liste")} />;
  }

  if (vue === "nouvelle_commande" && !catalogue) {
    return <p className="mt-6 text-gray-500">Chargement…</p>;
  }

  if (vue === "nouvelle_commande" && catalogue) {
    return (
      <div className="mt-4">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setVue("liste")}
            className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
          >
            Commandes en cours
            {commandes.length > 0 && (
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-bold text-white">{commandes.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => ouvrirVueAvecCatalogue("encaissements")}
            disabled={chargementCatalogue}
            className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            Encaissements
            {catalogue.livraisonsAEncaisser.length > 0 && (
              <span className="rounded-full bg-[#8B2020] px-2 py-0.5 text-xs font-bold text-white">
                {catalogue.livraisonsAEncaisser.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setVue("tiroir")}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
          >
            Tiroir-caisse
          </button>
          <button
            type="button"
            onClick={() => setVue("fin_service")}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
          >
            Fin de service
          </button>
        </div>
        <BandeauFondsCaisse onOuvrir={() => setVue("tiroir")} />
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

  if (vue === "modifier_commande" && catalogue && commandeAModifier) {
    return (
      <div className="mt-4">
        <CaisseApp
          produits={catalogue.produits}
          viandes={catalogue.viandes}
          sauces={catalogue.sauces}
          saveurs={catalogue.saveurs}
          parfums2l={catalogue.parfums2l}
          parametres={catalogue.parametres}
          nomEmploye={nom}
          commandeExistante={commandeAModifier}
          onTerminerModification={() => {
            setVue("liste");
            setCommandeAModifier(null);
            charger();
          }}
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
      {catalogue && (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <EtatSiteApp ouvertInitial={catalogue.parametres.siteOuvert} />
          </div>
          <div className="flex-1">
            <LivraisonActiveApp actifInitial={catalogue.parametres.livraisonActive} />
          </div>
        </div>
      )}
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
        {commandes.map((c) => {
          const minutesEtape = minutesDepuis(c.statutChangeLe ?? c.creeLe);
          const enRetard = c.statut === "pret" && minutesEtape >= seuilAlerteMin;
          const modifiable = STATUTS_MODIFIABLES.has(c.statut);
          const annulableAvecMotif = !["en_attente", "livre", "remis_au_client", "annulee"].includes(c.statut);
          return (
            <div
              key={c.id}
              className={`rounded-lg border-2 p-3 ${enRetard ? "bordure-urgence-clignotante border-red-600" : "border-gray-200"}`}
            >
              {enRetard && (
                <div className="bandeau-urgence-clignotant mb-2 rounded px-2 py-1 text-sm font-bold text-white">
                  🚨 Prête depuis {minutesEtape} min — pas encore {c.canal === "livraison" ? "enlevée" : "remise"}
                </div>
              )}
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
              <div className="mt-2 flex flex-wrap gap-2">
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
                {modifiable && (
                  <button
                    type="button"
                    onClick={() => ouvrirModification(c.id)}
                    disabled={enCours === c.id || chargementCatalogue}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    Modifier
                  </button>
                )}
                {modifiable && (
                  <button
                    type="button"
                    onClick={() => {
                      setCanalEnEdition(canalEnEdition === c.id ? null : c.id);
                      setNouveauCanal(null);
                      setAdresseCanal(c.adresse ?? "");
                      setZoneCanal("");
                    }}
                    disabled={enCours === c.id}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    Mode de retrait
                  </button>
                )}
                {c.statut === "en_attente" ? (
                  <button
                    type="button"
                    onClick={() => setAnnulationEnAttente(c.id)}
                    disabled={enCours === c.id}
                    className="rounded border border-red-600 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                ) : annulableAvecMotif ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAnnulationAvecMotifPour(c.id);
                      setMotifChoisi("");
                    }}
                    disabled={enCours === c.id}
                    className="rounded border border-red-600 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    Annuler (avec motif)
                  </button>
                ) : null}
                {c.statut === "pris_par_livreur" && (
                  <button
                    type="button"
                    onClick={() => setRelacherEnAttente(c.id)}
                    disabled={enCours === c.id}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    Remettre en attente de livreur
                  </button>
                )}
              </div>

              {canalEnEdition === c.id && (
                <div className="mt-2 space-y-2 rounded border border-gray-300 bg-gray-50 p-2">
                  <p className="text-sm font-semibold text-black">
                    Actuellement : {LIBELLES_CANAL[c.canal] ?? c.canal}. Nouveau mode de retrait :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(["sur_place", "emporter", "livraison"] as const)
                      .filter((k) => k !== c.canal)
                      .map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setNouveauCanal(k)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                            nouveauCanal === k ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 bg-white text-gray-700"
                          }`}
                        >
                          {LIBELLES_CANAL[k]}
                        </button>
                      ))}
                  </div>
                  {nouveauCanal === "livraison" && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={adresseCanal}
                        onChange={(e) => setAdresseCanal(e.target.value)}
                        placeholder="Adresse de livraison"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
                      />
                      <select
                        value={zoneCanal}
                        onChange={(e) => setZoneCanal(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
                      >
                        <option value="">Commune de livraison…</option>
                        {(catalogue?.parametres.zonesActives ?? []).map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => appliquerChangementCanal(c.id)}
                      disabled={
                        enCours === c.id ||
                        !nouveauCanal ||
                        (nouveauCanal === "livraison" && (!adresseCanal.trim() || !zoneCanal))
                      }
                      className="rounded bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Appliquer
                    </button>
                    <button type="button" onClick={() => setCanalEnEdition(null)} className="text-sm text-gray-500 underline">
                      Fermer
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Le contenu et le paiement ne changent pas. Le ticket repart à l&apos;impression avec le bon mode.
                  </p>
                </div>
              )}

              {annulationAvecMotifPour === c.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-2">
                  <select
                    value={motifChoisi}
                    onChange={(e) => setMotifChoisi(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Motif de l&apos;annulation…</option>
                    {Object.entries(LIBELLES_MOTIF).map(([valeur, libelle]) => (
                      <option key={valeur} value={valeur}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setConfirmationMotifOuverte(true)}
                    disabled={!motifChoisi}
                    className="rounded bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnulationAvecMotifPour(null)}
                    className="text-sm text-gray-500 underline"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          );
        })}
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

      {relacherEnAttente && (
        <ConfirmationPin
          titre="Confirmer : remettre au pot commun"
          onAnnule={() => setRelacherEnAttente(null)}
          onConfirme={() => {
            const id = relacherEnAttente;
            setRelacherEnAttente(null);
            appliquer(id, "relacher_livreur");
          }}
        />
      )}

      {confirmationMotifOuverte && annulationAvecMotifPour && (
        <ConfirmationPin
          titre="Confirmer l'annulation"
          onAnnule={() => setConfirmationMotifOuverte(false)}
          onConfirme={() => {
            const id = annulationAvecMotifPour;
            const motif = motifChoisi;
            setConfirmationMotifOuverte(false);
            setAnnulationAvecMotifPour(null);
            annulerAvecMotif(id, motif);
          }}
        />
      )}
    </div>
  );
}
