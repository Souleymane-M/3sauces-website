"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModePaiement } from "@3sauces/supabase";
import type { EtatScan, LivraisonAssignee } from "@/lib/livreur/types";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { regrouperLignesParCategorie } from "@/lib/caisse/regroupement-lignes";
import { formaterTelephoneAffichage, formaterTelephonePourAppel } from "@/lib/telephone";

interface ScanLivraisonAppProps {
  qrCode: string;
  etatInitial: EtatScan;
}

type ChoixPaiement = "especes" | "cb" | "mixte" | null;

// Même logique que la liste /livreur (livreur-app.tsx) — défensif comme côté
// cuisine, d'anciennes commandes peuvent avoir un `contenu` qui ne respecte
// pas exactement la forme actuelle de LigneCommande.
function detailLigne(l: LivraisonAssignee["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes && l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  if (l.boissonIncluse) details.push(`Boisson incluse : ${l.boissonIncluse}`);
  if (l.sansBoisson) details.push("SANS BOISSON — ne pas donner de canette");
  if (l.accompagnementsInclus?.length)
    details.push(`Accompagnement : ${l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
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

/**
 * Page ouverte en flashant le QR d'un ticket livraison avec l'appareil
 * photo du téléphone — remplace à la fois le choix du livreur en cuisine
 * (prise en charge) et la liste de `/livreur` pour la déclaration du
 * paiement à la livraison. Un seul geste par étape, pas de liste à parcourir.
 */
export function ScanLivraisonApp({ qrCode, etatInitial }: ScanLivraisonAppProps) {
  const router = useRouter();
  const etat = etatInitial;
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeLocal, setConfirmeLocal] = useState<"prise" | "livre" | "echec" | "relache" | null>(null);
  const [choix, setChoix] = useState<ChoixPaiement>(null);
  const [montantEspeces, setMontantEspeces] = useState("");
  const [montantEspecesMixte, setMontantEspecesMixte] = useState("");
  const [echecOuvert, setEchecOuvert] = useState(false);
  const [motifEchec, setMotifEchec] = useState("");
  const [relacherOuvert, setRelacherOuvert] = useState(false);

  async function prendre() {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/livreur/prendre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la prise en charge.");
        return;
      }
      setConfirmeLocal("prise");
      router.refresh();
    } catch {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  async function declarer(commandeId: string, paiements: { mode: ModePaiement; montant: number }[]) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/livreur/declarer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, paiements }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec de la déclaration.");
        return;
      }
      setConfirmeLocal("livre");
    } catch {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  async function signalerEchec(commandeId: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/livreur/signaler-echec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId, motif: motifEchec }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec du signalement.");
        return;
      }
      setConfirmeLocal("echec");
    } catch {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  async function relacher(commandeId: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/livreur/relacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Échec du relâchement.");
        return;
      }
      setConfirmeLocal("relache");
    } catch {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  // Après une action réussie, le serveur refait autorité : on ne recalcule
  // jamais l'état nous-mêmes, mais on affiche un message de succès pendant
  // le court instant avant que `router.refresh()` ne renvoie le nouvel état.
  if (confirmeLocal === "prise") {
    return <MessageEtat emoji="📦" titre="Pris en charge !" detail="Bonne route." />;
  }
  if (confirmeLocal === "livre") {
    return <MessageEtat emoji="✅" titre="Livraison confirmée" detail="Paiement enregistré, merci !" />;
  }
  if (confirmeLocal === "echec") {
    return (
      <MessageEtat emoji="🚨" titre="Signalé" detail="Un responsable a été alerté, merci — tu peux passer à la suivante." />
    );
  }
  if (confirmeLocal === "relache") {
    return (
      <MessageEtat emoji="🔄" titre="Relâchée" detail="Elle repart au pot commun — un collègue ou le comptoir va la reprendre." />
    );
  }

  if (etat.type === "introuvable") {
    return <MessageEtat emoji="❓" titre="Ticket introuvable" detail="Ce QR ne correspond à aucune livraison." />;
  }
  if (etat.type === "annulee") {
    return <MessageEtat emoji="🚫" titre="Commande annulée" detail="Rien à livrer, préviens la cuisine si besoin." />;
  }
  if (etat.type === "deja_livree") {
    return <MessageEtat emoji="✅" titre={`Commande #${etat.numero}`} detail="Déjà livrée et payée." />;
  }
  if (etat.type === "deja_prise_autre") {
    return (
      <MessageEtat
        emoji="🚷"
        titre={`Commande #${etat.numero}`}
        detail={`Déjà prise en charge par ${etat.nomLivreur ?? "un autre livreur"}.`}
      />
    );
  }

  const { livraison, commandeId } = etat;
  const montantDu = Math.round(livraison.montant * 100) / 100;

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-center text-xl font-bold text-gray-900">#{String(livraison.numero).padStart(4, "0")}</h1>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-lg font-bold text-gray-900">{livraison.nom}</p>
        {livraison.adresse && <p className="text-sm text-gray-700">{livraison.adresse}</p>}
        {livraison.clientTelephone && (
          <a href={`tel:${formaterTelephonePourAppel(livraison.clientTelephone)}`} className="mt-1 block text-sm font-semibold text-[#8B2020] underline">
            📞 {formaterTelephoneAffichage(livraison.clientTelephone)}
          </a>
        )}
        <p className="mt-1 text-sm text-gray-700">Heure souhaitée : {formaterHeure(livraison.heureSouhaitee)}</p>
        <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
          {regrouperLignesParCategorie(livraison.lignes).map((groupe) => (
            <div key={groupe.categorie}>
              <p className="text-xs font-semibold uppercase text-gray-500">{groupe.titre}</p>
              {groupe.lignes.map((l, i) => (
                <div key={i} className="text-sm text-gray-800">
                  <p className="font-semibold">
                    {l.quantite * piecesParPaquet(l.nom)}x {nomSansMultiplicateur(l.nom)}
                  </p>
                  {detailLigne(l).map((detail, j) => (
                    <p key={j} className="pl-2 text-xs text-gray-600">
                      {detail}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-lg font-bold text-gray-900">
          {livraison.dejaPayee ? "Déjà payée en ligne" : `À récupérer : ${montantDu.toFixed(2)} €`}
        </p>
      </div>

      {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}

      {etat.type === "a_prendre" && etat.exclu && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Tu viens de relâcher cette livraison — un collègue ou le comptoir doit la reprendre.
        </p>
      )}

      {etat.type === "a_prendre" && !etat.exclu && (
        <>
          {etat.pasEncorePrete && (
            <p className="mb-2 rounded border border-amber-400 bg-amber-50 p-2 text-sm font-semibold text-amber-800">
              ⏳ Pas encore marquée &quot;Prête&quot; en cuisine — vérifie que le sachet est bien complet avant de partir.
            </p>
          )}
          <button
            type="button"
            onClick={prendre}
            disabled={enCours}
            className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
          >
            {enCours ? "…" : "Je prends cette livraison"}
          </button>
        </>
      )}

      {etat.type === "a_livrer" && livraison.dejaPayee && (
        <button
          type="button"
          onClick={() => declarer(commandeId, [])}
          disabled={enCours}
          className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Confirmer la livraison"}
        </button>
      )}

      {etat.type === "a_livrer" && !livraison.dejaPayee && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Comment le client a-t-il payé ?</p>
          <div className="grid grid-cols-3 gap-2">
            {(["especes", "cb", "mixte"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChoix(c)}
                className={`rounded border py-2 text-sm font-semibold ${
                  choix === c ? "border-[#8B2020] bg-[#8B2020] text-white" : "border-gray-300 text-gray-700"
                }`}
              >
                {c === "especes" ? "Espèces" : c === "cb" ? "Carte" : "Mixte"}
              </button>
            ))}
          </div>

          {choix === "especes" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Combien le client t&apos;a-t-il donné ?</p>
              <input
                value={montantEspeces}
                onChange={(e) => setMontantEspeces(e.target.value)}
                placeholder={montantDu.toFixed(2)}
                inputMode="decimal"
                className="w-full rounded border border-gray-300 p-3 text-lg text-gray-900"
              />
              {(() => {
                const recu = Number(montantEspeces.replace(",", "."));
                if (!montantEspeces.trim() || !Number.isFinite(recu)) return null;
                const monnaie = Math.round((recu - montantDu) * 100) / 100;
                if (monnaie < 0) {
                  return (
                    <p className="text-sm font-semibold text-red-600">
                      Il manque {Math.abs(monnaie).toFixed(2)} € — le client doit encore {Math.abs(monnaie).toFixed(2)} €.
                    </p>
                  );
                }
                if (monnaie > 0) {
                  return (
                    <p className="text-lg font-bold text-[#2D5A27]">💶 Rendre {monnaie.toFixed(2)} € de monnaie</p>
                  );
                }
                return <p className="text-sm font-semibold text-gray-600">Compte juste, rien à rendre.</p>;
              })()}
              <button
                type="button"
                onClick={() => declarer(commandeId, [{ mode: "especes", montant: montantDu }])}
                disabled={enCours}
                className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
              >
                {enCours ? "…" : `Confirmer ${montantDu.toFixed(2)} € en espèces`}
              </button>
            </div>
          )}

          {choix === "cb" && (
            <button
              type="button"
              onClick={() => declarer(commandeId, [{ mode: "cb", montant: montantDu }])}
              disabled={enCours}
              className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
            >
              {enCours ? "…" : `Confirmer ${montantDu.toFixed(2)} € par carte`}
            </button>
          )}

          {choix === "mixte" && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Montant payé en espèces (le reste sera compté en carte) :</p>
              <input
                value={montantEspecesMixte}
                onChange={(e) => setMontantEspecesMixte(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full rounded border border-gray-300 p-3 text-lg text-gray-900"
              />
              <button
                type="button"
                onClick={() => {
                  const especes = Number(montantEspecesMixte.replace(",", "."));
                  if (!Number.isFinite(especes) || especes < 0 || especes > montantDu) return;
                  const cb = Math.round((montantDu - especes) * 100) / 100;
                  const paiements: { mode: ModePaiement; montant: number }[] = [];
                  if (especes > 0) paiements.push({ mode: "especes", montant: especes });
                  if (cb > 0) paiements.push({ mode: "cb", montant: cb });
                  declarer(commandeId, paiements);
                }}
                disabled={enCours || !montantEspecesMixte.trim()}
                className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
              >
                {enCours ? "…" : "Confirmer"}
              </button>
            </div>
          )}
        </div>
      )}

      {etat.type === "a_livrer" && !echecOuvert && !relacherOuvert && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setRelacherOuvert(true)}
            className="w-full rounded border border-gray-400 py-3 text-sm font-semibold text-gray-700"
          >
            🔄 Je change de tournée (remettre au pot commun)
          </button>
          <button
            type="button"
            onClick={() => setEchecOuvert(true)}
            className="w-full rounded border border-red-600 py-3 text-sm font-semibold text-red-600"
          >
            ❌ Impossible de livrer
          </button>
        </div>
      )}

      {etat.type === "a_livrer" && relacherOuvert && (
        <div className="space-y-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-800">
            La commande redevient disponible pour un collègue (ou le comptoir) — à redéposer au resto ou à remettre en
            main si tu croises quelqu&apos;un.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRelacherOuvert(false)}
              className="flex-1 rounded border border-gray-300 py-2 text-sm font-semibold text-gray-700"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => relacher(commandeId)}
              disabled={enCours}
              className="flex-1 rounded bg-gray-700 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {enCours ? "…" : "Confirmer"}
            </button>
          </div>
        </div>
      )}

      {etat.type === "a_livrer" && echecOuvert && (
        <div className="space-y-2 rounded-lg border border-red-600 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-700">
            Pourquoi ? (client absent, adresse introuvable, refusée...)
          </p>
          <input
            value={motifEchec}
            onChange={(e) => setMotifEchec(e.target.value)}
            placeholder="Motif"
            className="w-full rounded border border-gray-300 p-3 text-sm text-gray-900"
          />
          <p className="text-xs text-gray-600">Un responsable sera alerté tout de suite par email.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEchecOuvert(false)}
              className="flex-1 rounded border border-gray-300 py-2 text-sm font-semibold text-gray-700"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => signalerEchec(commandeId)}
              disabled={enCours}
              className="flex-1 rounded bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {enCours ? "…" : "Signaler"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageEtat({ emoji, titre, detail }: { emoji: string; titre: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 text-center">
      <p className="text-4xl">{emoji}</p>
      <p className="text-xl font-bold text-gray-900">{titre}</p>
      <p className="text-gray-600">{detail}</p>
      {/* Pas besoin de rescanner pour livrer/déclarer un paiement : la liste
          affiche déjà toutes les livraisons en cours, sélectionnables —
          demande explicite du patron, 2026-10-16 (deux façons d'y arriver,
          scan ou liste, au choix selon ce qui est le plus rapide sur le
          moment). */}
      <a href="/livreur" className="inline-block text-sm font-semibold text-[#8B2020] underline">
        ← Voir mes livraisons en cours
      </a>
    </div>
  );
}
