"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ModePaiement } from "@3sauces/supabase";
import type { EtatScan } from "@/lib/livreur/types";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { regrouperLignesParCategorie } from "@/lib/caisse/regroupement-lignes";

interface ScanLivraisonAppProps {
  qrCode: string;
  etatInitial: EtatScan;
}

type ChoixPaiement = "especes" | "cb" | "mixte" | null;

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
  const [confirmeLocal, setConfirmeLocal] = useState<"prise" | "livre" | null>(null);
  const [choix, setChoix] = useState<ChoixPaiement>(null);
  const [montantEspeces, setMontantEspeces] = useState("");
  const [montantEspecesMixte, setMontantEspecesMixte] = useState("");

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

  // Après une action réussie, le serveur refait autorité : on ne recalcule
  // jamais l'état nous-mêmes, mais on affiche un message de succès pendant
  // le court instant avant que `router.refresh()` ne renvoie le nouvel état.
  if (confirmeLocal === "prise") {
    return <MessageEtat emoji="📦" titre="Pris en charge !" detail="Bonne route." />;
  }
  if (confirmeLocal === "livre") {
    return <MessageEtat emoji="✅" titre="Livraison confirmée" detail="Paiement enregistré, merci !" />;
  }

  if (etat.type === "introuvable") {
    return <MessageEtat emoji="❓" titre="Ticket introuvable" detail="Ce QR ne correspond à aucune livraison." />;
  }
  if (etat.type === "annulee") {
    return <MessageEtat emoji="🚫" titre="Commande annulée" detail="Rien à livrer, préviens la cuisine si besoin." />;
  }
  if (etat.type === "pas_prete") {
    return (
      <MessageEtat emoji="⏳" titre={`Commande #${etat.numero}`} detail="Pas encore prête en cuisine — repasse plus tard." />
    );
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
        <div className="mt-2 space-y-1">
          {regrouperLignesParCategorie(livraison.lignes).map((groupe) => (
            <div key={groupe.categorie}>
              {groupe.lignes.map((l, i) => (
                <p key={i} className="text-sm text-gray-800">
                  {l.quantite * piecesParPaquet(l.nom)}x {nomSansMultiplicateur(l.nom)}
                </p>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-lg font-bold text-gray-900">
          {livraison.modePaiement === "stripe" ? "Déjà payée en ligne" : `À récupérer : ${montantDu.toFixed(2)} €`}
        </p>
      </div>

      {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}

      {etat.type === "a_prendre" && (
        <button
          type="button"
          onClick={prendre}
          disabled={enCours}
          className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Je prends cette livraison"}
        </button>
      )}

      {etat.type === "a_livrer" && livraison.modePaiement === "stripe" && (
        <button
          type="button"
          onClick={() => declarer(commandeId, [])}
          disabled={enCours}
          className="w-full rounded bg-[#8B2020] py-4 text-lg font-bold text-white disabled:opacity-40"
        >
          {enCours ? "…" : "Confirmer la livraison"}
        </button>
      )}

      {etat.type === "a_livrer" && livraison.modePaiement !== "stripe" && (
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
              <input
                value={montantEspeces}
                onChange={(e) => setMontantEspeces(e.target.value)}
                placeholder={montantDu.toFixed(2)}
                inputMode="decimal"
                className="w-full rounded border border-gray-300 p-3 text-lg text-gray-900"
              />
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
    </div>
  );
}

function MessageEtat({ emoji, titre, detail }: { emoji: string; titre: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-2 text-center">
      <p className="text-4xl">{emoji}</p>
      <p className="text-xl font-bold text-gray-900">{titre}</p>
      <p className="text-gray-600">{detail}</p>
    </div>
  );
}
