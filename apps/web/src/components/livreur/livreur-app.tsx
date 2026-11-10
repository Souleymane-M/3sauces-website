"use client";

import { libellePayee } from "@/lib/libelle-paiement";
import { FormulaireImpossibleLivrer } from "./formulaire-impossible-livrer";
import { FormulairePaiementPartiel } from "./formulaire-paiement-partiel";
import { libelleBoissonLigne } from "@/lib/libelle-ligne";
import { useEffect, useState } from "react";
import type { ModePaiement } from "@3sauces/supabase";
import type { LivraisonAssignee, LivraisonDisponible } from "@/lib/livreur/types";
import { libellePalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { regrouperLignesParCategorie } from "@/lib/caisse/regroupement-lignes";
import { formaterTelephoneAffichage, formaterTelephonePourAppel } from "@/lib/telephone";
import { construireLienWhatsapp } from "@/lib/livreur/whatsapp";

// Défensif comme côté cuisine : d'anciennes commandes peuvent avoir un
// `contenu` qui ne respecte pas exactement la forme actuelle de LigneCommande.
function detailLigne(l: LivraisonAssignee["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes && l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.sansSauce) details.push("SANS SAUCE");
  if (l.saladeOption) details.push("+ Salade");
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  const boisson = libelleBoissonLigne(l);
  if (boisson) details.push(boisson);
  if (l.sansBoisson) details.push("SANS BOISSON — ne pas donner de canette");
  if (l.saladeIncluse === true) details.push("Avec salade");
  if (l.saladeIncluse === false) details.push("SANS SALADE");
  if (l.accompagnementsInclus?.length)
    details.push(`Accompagnement : ${l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
}

interface LivreurAppProps {
  livraisonsInitiales: LivraisonAssignee[];
  enAttenteInitiales: LivraisonDisponible[];
}

/** Sondage régulier de /api/livreur/commandes — même esprit que l'alerte sonore côté caisse, pour que la liste "en attente" se tienne à jour sans rafraîchissement manuel. */
const INTERVALLE_SONDAGE_MS = 8_000;

interface DeclarationEnCours {
  choixSimple: "especes" | "cb" | "mixte" | null;
  montantRecu: string;
  montantEspecesMixte: string;
}

function declarationVide(): DeclarationEnCours {
  return {
    choixSimple: null,
    montantRecu: "",
    montantEspecesMixte: "",
  };
}

const CLE_WHATSAPP_OUVERTS = "livreur_whatsapp_ouverts";

/** Borné au jour en cours (clé incluant la date) : jamais besoin de nettoyer manuellement, les anciennes marques disparaissent toutes seules le lendemain. */
function chargerWhatsappOuverts(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const brut = localStorage.getItem(CLE_WHATSAPP_OUVERTS);
    if (!brut) return new Set();
    const { jour, ids } = JSON.parse(brut) as { jour: string; ids: string[] };
    return jour === new Date().toISOString().slice(0, 10) ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

function sauvegarderWhatsappOuverts(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLE_WHATSAPP_OUVERTS, JSON.stringify({ jour: new Date().toISOString().slice(0, 10), ids: [...ids] }));
  } catch {
    // Échec silencieux (mode privé, stockage plein...) : jamais bloquant, juste moins pratique.
  }
}

// Toujours la date ET l'heure, jamais l'heure seule — sinon impossible de
// distinguer une livraison de la veille restée bloquée d'une du jour même.
function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function LivreurApp({ livraisonsInitiales, enAttenteInitiales }: LivreurAppProps) {
  const [livraisons, setLivraisons] = useState<LivraisonAssignee[]>(livraisonsInitiales);
  const [enAttente, setEnAttente] = useState<LivraisonDisponible[]>(enAttenteInitiales);
  const [declarationsOuvertes, setDeclarationsOuvertes] = useState<Record<string, DeclarationEnCours>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // "Impossible à livrer" directement depuis la liste (sans re-scanner le QR code) : commande dont le formulaire
  // est ouvert + motif choisi/saisi.
  const [echecOuvertId, setEchecOuvertId] = useState<string | null>(null);
  const [partielOuvertId, setPartielOuvertId] = useState<string | null>(null);
  // Remarque libre facultative par livraison (envoyée avec la déclaration de livraison).
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  // La commande reste "en livraison" côté serveur (le responsable décide de la suite) : on mémorise juste ici
  // qu'elle a été signalée pour ne pas laisser croire que rien ne s'est passé.
  const [echecsSignales, setEchecsSignales] = useState<Set<string>>(new Set());
  // Mémorise lesquelles ont déjà été tapotées (on sait seulement que le
  // lien a été ouvert, jamais que le message a vraiment été envoyé — texte
  // volontairement "ouvert", jamais "envoyé", pour rester honnête sur ce
  // qu'on peut savoir). Persisté sur le téléphone (localStorage), borné au
  // jour en cours : sans ça, revenir sur /livreur après être passé par une
  // autre page (ex: scanner le ticket d'une nouvelle commande) rechargeait
  // tout le composant et faisait réapparaître le bouton comme si rien
  // n'avait été envoyé — bug réel constaté le 2026-10-23.
  const [whatsappOuverts, setWhatsappOuverts] = useState<Set<string>>(() => chargerWhatsappOuverts());
  useEffect(() => {
    sauvegarderWhatsappOuverts(whatsappOuverts);
  }, [whatsappOuverts]);
  // Recherche locale parmi les livraisons déjà assignées — utile dès que
  // le livreur en a plusieurs en main et veut retrouver vite un client par
  // numéro de commande, nom ou adresse, sans faire défiler toute la liste.
  const [recherche, setRecherche] = useState("");
  // Deux listes bien séparées (demande du patron, 2026-10-27) : celles que
  // le livreur a déjà flashées et prises en main ("En livraison"), et celles
  // pas encore scannées ("À récupérer"), qui le noyaient au milieu.
  const [onglet, setOnglet] = useState<"livraison" | "attente">("livraison");
  const rechercheNormalisee = recherche.trim().toLowerCase();
  const livraisonsFiltrees = rechercheNormalisee
    ? livraisons.filter((l) =>
        [`#${l.numero}`, l.nom, l.adresse ?? ""].some((champ) => champ.toLowerCase().includes(rechercheNormalisee))
      )
    : livraisons;

  // Sondage en direct des deux listes — jamais pendant qu'une déclaration de
  // paiement ou une prise en charge est en cours, pour ne jamais écraser une
  // saisie active sous le pied du livreur.
  useEffect(() => {
    let annule = false;
    const minuteur = setInterval(async () => {
      if (annule || enCours !== null || Object.keys(declarationsOuvertes).length > 0) return;
      try {
        const reponse = await fetch("/api/livreur/commandes");
        if (!reponse.ok || annule) return;
        const data = await reponse.json();
        if (annule) return;
        if (Array.isArray(data.livraisons)) setLivraisons(data.livraisons);
        if (Array.isArray(data.enAttente)) setEnAttente(data.enAttente);
      } catch {
        // Échec silencieux : la prochaine tentative, 8s plus tard, suffit —
        // jamais bloquant pour le livreur.
      }
    }, INTERVALLE_SONDAGE_MS);
    return () => {
      annule = true;
      clearInterval(minuteur);
    };
  }, [enCours, declarationsOuvertes]);

  async function signalerEchec(livraison: LivraisonAssignee, motif: string) {
    setErreur(null);
    setEnCours(livraison.id);
    try {
      const reponse = await fetch("/api/livreur/signaler-echec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: livraison.id, motif }),
      });
      if (!reponse.ok) {
        const data = await reponse.json().catch(() => ({}));
        setErreur(data.error ?? "Échec du signalement.");
        return;
      }
      setEchecsSignales((prec) => new Set(prec).add(livraison.id));
      setEchecOuvertId(null);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnCours(null);
    }
  }

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

  async function envoyer(
    livraison: LivraisonAssignee,
    paiements: { mode: ModePaiement; montant: number; payeur?: string }[],
    partiel?: { motif: string; plats: string[] }
  ) {
    setErreur(null);
    setEnCours(livraison.id);
    try {
      const reponse = await fetch("/api/livreur/declarer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandeId: livraison.id,
          paiements,
          commentaire: commentaires[livraison.id],
          partiel: partiel ? true : undefined,
          motifPartiel: partiel?.motif,
          platsNonRecuperes: partiel?.plats,
        }),
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

  return (
    <div className="mt-4 space-y-4">
      {erreur && <p className="text-lg text-red-600">{erreur}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOnglet("livraison")}
          className={`rounded-lg py-3 text-base font-bold ${
            onglet === "livraison" ? "bg-[#2D5A27] text-white" : "border border-gray-300 text-gray-700"
          }`}
        >
          En livraison ({livraisons.length})
        </button>
        <button
          type="button"
          onClick={() => setOnglet("attente")}
          className={`rounded-lg py-3 text-base font-bold ${
            onglet === "attente" ? "bg-orange-500 text-white" : "border border-gray-300 text-gray-700"
          }`}
        >
          À récupérer ({enAttente.length})
        </button>
      </div>

      {onglet === "attente" && enAttente.length === 0 && (
        <p className="text-xl text-gray-400">Aucune livraison en attente.</p>
      )}

      {onglet === "attente" && enAttente.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">
            {enAttente.length} livraison{enAttente.length > 1 ? "s" : ""} pas encore scannée{enAttente.length > 1 ? "s" : ""}
          </h2>
          {enAttente.map((livraison) => (
            <div key={livraison.id} className="rounded-xl border-2 border-dashed border-gray-300 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold text-gray-900">Commande #{livraison.numero}</span>
                <span className="text-lg text-gray-700">{formaterHeure(livraison.heureSouhaitee)}</span>
              </div>
              <p className="mt-1 text-lg text-gray-900">{livraison.nom}</p>
              <p className="text-base text-gray-700">{livraison.adresse}</p>
              {livraison.pasEncorePrete && (
                <p className="mt-1 text-sm font-semibold text-orange-600">⏳ Pas encore annoncée prête en cuisine</p>
              )}
              {livraison.exclu ? (
                <p className="mt-2 text-sm text-gray-500">Tu viens de la relâcher — un collègue doit la reprendre.</p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-gray-600">📱 Flashe le QR du ticket au resto pour la prendre</p>
              )}
            </div>
          ))}
        </div>
      )}

      {onglet === "livraison" && livraisons.length > 1 && (
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une commande (numéro, nom, adresse)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900"
        />
      )}

      {onglet === "livraison" && livraisons.length === 0 && <p className="text-xl text-gray-400">Aucune livraison en cours.</p>}
      {onglet === "livraison" && livraisons.length > 0 && livraisonsFiltrees.length === 0 && (
        <p className="text-base text-gray-400">Aucune livraison ne correspond à &quot;{recherche}&quot;.</p>
      )}

      {(onglet === "livraison" ? livraisonsFiltrees : []).map((livraison) => {
        const declaration = declarationsOuvertes[livraison.id];
        const prioritaire = livraison.palierGroupe !== null;
        // Remise éventuelle (lancement et/ou récompense fidélité) : déduite
        // de l'écart entre la somme des lignes et le montant réellement dû —
        // pour que le livreur sache que le client a eu une réduction, pas
        // juste le montant final à récupérer.
        const montantBrutLivraison = livraison.lignes.reduce((t, l) => t + l.prixUnitaire * l.quantite, 0);
        const remiseLivraison = Math.round((montantBrutLivraison - livraison.montant) * 100) / 100;

        return (
          <div
            key={livraison.id}
            className={`rounded-xl border-2 p-4 ${prioritaire ? "border-orange-500" : "border-gray-200"}`}
          >
            {prioritaire && (
              <div className="mb-2 inline-block rounded bg-orange-500 px-2 py-1 text-lg font-bold text-white">
                {libellePalierGroupe(livraison.palierGroupe)} 🚀
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-gray-900">Commande #{livraison.numero}</span>
              <span className="text-xl text-gray-900">{formaterHeure(livraison.heureSouhaitee)}</span>
            </div>
            <p className="mt-1 text-lg text-gray-900">{livraison.nom}</p>
            <p className="text-lg text-gray-700">{livraison.adresse}</p>
            {livraison.clientTelephone && (
              <a href={`tel:${formaterTelephonePourAppel(livraison.clientTelephone)}`} className="text-base font-semibold text-[#8B2020] underline">
                📞 {formaterTelephoneAffichage(livraison.clientTelephone)}
              </a>
            )}

            {(() => {
              const lien = construireLienWhatsapp(livraison);
              if (!lien) return null;
              const ouvert = whatsappOuverts.has(livraison.id);
              return (
                <a
                  href={lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWhatsappOuverts((prec) => new Set(prec).add(livraison.id))}
                  className={`mt-2 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold ${
                    ouvert ? "bg-gray-100 text-gray-500" : "bg-[#25D366] text-white"
                  }`}
                >
                  {ouvert ? "✓ WhatsApp ouvert" : "📱 Prévenir via WhatsApp"}
                </a>
              );
            })()}

            {livraison.lignes.length > 0 && (
              <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                {regrouperLignesParCategorie(livraison.lignes).map((groupe) => (
                  <div key={groupe.categorie}>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{groupe.titre}</p>
                    <ul className="mt-0.5 space-y-1">
                      {groupe.lignes.map((l, i) => (
                        <li key={i} className="text-base text-gray-900">
                          <span className="font-semibold">
                            {l.quantite * piecesParPaquet(l.nom)}x {nomSansMultiplicateur(l.nom)}
                          </span>
                          <span className="ml-2 text-base font-bold text-[#8B2020]">
                            {(l.prixUnitaire * l.quantite).toFixed(2).replace(".", ",")} €
                          </span>
                          {detailLigne(l).map((detail, j) => (
                            <div key={j} className="text-sm text-gray-600">
                              {detail}
                            </div>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {livraison.dejaPayee ? (
              <div className="mt-2 rounded-lg border-2 border-[#2D5A27] bg-[#2D5A27]/10 p-3 text-center">
                <p className="text-xl font-extrabold text-[#2D5A27]">✅ {libellePayee(livraison.modePaiement)}</p>
                <p className="text-base font-semibold text-[#2D5A27]">Rien à récupérer — ne rien demander au client</p>
              </div>
            ) : (
              <>
                {remiseLivraison > 0.009 && (
                  <p className="mt-2 text-base font-semibold text-[#2D5A27]">
                    🎁 Remise appliquée : -{remiseLivraison.toFixed(2)} €
                  </p>
                )}
                <p className="mt-1 text-2xl font-bold text-gray-900">{livraison.montant.toFixed(2)} € à récupérer</p>
              </>
            )}

            <textarea
              value={commentaires[livraison.id] ?? ""}
              onChange={(e) => setCommentaires((prec) => ({ ...prec, [livraison.id]: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="Remarque (facultatif) : sauce, boisson, couverts oubliés…"
              className="mt-3 w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
            />

            {!declaration && livraison.dejaPayee && (
              <button
                onClick={() => envoyer(livraison, [])}
                disabled={enCours === livraison.id}
                className="mt-4 w-full rounded bg-[#2D5A27] py-3 text-xl font-bold text-white disabled:opacity-40"
              >
                Marquer comme livrée
              </button>
            )}

            {!declaration && !livraison.dejaPayee && (
              <button
                onClick={() => ouvrirDeclaration(livraison.id)}
                className="mt-4 w-full rounded bg-[#8B2020] py-3 text-xl font-bold text-white"
              >
                Livré
              </button>
            )}

            {!declaration && echecsSignales.has(livraison.id) && (
              <p className="mt-2 rounded bg-red-50 p-3 text-center text-base font-bold text-red-700">
                ⚠️ Signalé au responsable : livraison impossible
              </p>
            )}

            {!declaration && !echecsSignales.has(livraison.id) && echecOuvertId !== livraison.id && (
              <button
                onClick={() => {
                  setErreur(null);
                  setEchecOuvertId(livraison.id);
                }}
                className="mt-2 w-full rounded border-2 border-red-600 py-3 text-lg font-bold text-red-600"
              >
                ❌ Impossible à livrer
              </button>
            )}

            {!declaration && echecOuvertId === livraison.id && (
              <div className="mt-2">
                <FormulaireImpossibleLivrer
                  enCours={enCours === livraison.id}
                  onAnnuler={() => setEchecOuvertId(null)}
                  onEnvoyer={(motif) => signalerEchec(livraison, motif)}
                />
              </div>
            )}

            {declaration && (
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
                    <label className="text-sm text-gray-500">Montant reçu (facultatif, pour calculer la monnaie)</label>
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

                {partielOuvertId !== livraison.id ? (
                  <button onClick={() => setPartielOuvertId(livraison.id)} className="block text-sm text-orange-700 underline">
                    Paiement partiel
                  </button>
                ) : (
                  <FormulairePaiementPartiel
                    montantDu={livraison.montant}
                    lignes={livraison.lignes}
                    enCours={enCours === livraison.id}
                    onAnnuler={() => setPartielOuvertId(null)}
                    onValider={(paiements, motif, plats) => envoyer(livraison, paiements, { motif, plats })}
                  />
                )}

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

          </div>
        );
      })}
    </div>
  );
}
