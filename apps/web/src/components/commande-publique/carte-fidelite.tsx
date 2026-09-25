"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { normaliserTelephone } from "@/lib/telephone";
import { MONTANT_RECOMPENSE, TAGLINE_FIDELITE, messageFidelite } from "@/lib/fidelite/regles";

const CLE_LOCALSTORAGE = "3sauces_fidelite";
const DUREE_COOLDOWN_RENVOI = 60;

interface SoldeFidelite {
  montantCumule: number;
  tamponsAcquis: number;
  recompenseDisponible: boolean;
  dateExpiration: string | null;
}

interface JetonStocke {
  token: string;
  telephone: string;
  expireLe: string;
}

type Etape = "repliee" | "saisie" | "envoi" | "code" | "verifie" | "indisponible";

interface CarteFideliteProps {
  telephoneCommande: string;
  montantPanier: number;
  utiliserRecompense: boolean;
  onChangeUtiliserRecompense: (valeur: boolean) => void;
  onTokenChange: (token: string | null) => void;
  onPrefillTelephone: (telephone: string) => void;
}

/**
 * Contexte fidélité séparé du formulaire de commande : numéro de téléphone
 * dédié + OTP, jamais requis pour passer une commande classique. Une fois
 * vérifié, le jeton (30 jours) est gardé en localStorage — un échec Twilio
 * n'empêche jamais de commander, la carte reste simplement repliable.
 */
export function CarteFidelite({
  telephoneCommande,
  montantPanier,
  utiliserRecompense,
  onChangeUtiliserRecompense,
  onTokenChange,
  onPrefillTelephone,
}: CarteFideliteProps) {
  const [etape, setEtape] = useState<Etape>("repliee");
  const [telephoneSaisi, setTelephoneSaisi] = useState("");
  const [code, setCode] = useState("");
  const [telephoneVerifie, setTelephoneVerifie] = useState<string | null>(null);
  const [solde, setSolde] = useState<SoldeFidelite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const dejaMonte = useRef(false);

  useEffect(() => {
    if (dejaMonte.current) return;
    dejaMonte.current = true;
    try {
      const brut = localStorage.getItem(CLE_LOCALSTORAGE);
      if (!brut) return;
      const donnees = JSON.parse(brut) as JetonStocke;
      if (new Date(donnees.expireLe).getTime() > Date.now()) {
        chargerSolde(donnees.token, donnees.telephone);
      } else {
        localStorage.removeItem(CLE_LOCALSTORAGE);
      }
    } catch {
      // localStorage indisponible (navigation privée stricte, quota) : on
      // dégrade simplement vers l'écran de saisie, jamais bloquant.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const minuteur = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(minuteur);
  }, [cooldown]);

  // Si le numéro vérifié diffère de celui de la commande, on ne laisse pas
  // consommer la récompense avec cette incohérence — le serveur la
  // revérifie de toute façon, mais autant prévenir tout de suite.
  useEffect(() => {
    if (etape !== "verifie" || !telephoneVerifie) return;
    const telCommandeNormalise = normaliserTelephone(telephoneCommande);
    if (telCommandeNormalise && telCommandeNormalise !== telephoneVerifie && utiliserRecompense) {
      onChangeUtiliserRecompense(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telephoneCommande, telephoneVerifie, etape]);

  async function chargerSolde(token: string, telephone: string) {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/fidelite/solde", { headers: { Authorization: `Bearer ${token}` } });
      if (!reponse.ok) {
        localStorage.removeItem(CLE_LOCALSTORAGE);
        onTokenChange(null);
        setEtape("repliee");
        return;
      }
      const data = await reponse.json();
      setSolde({
        montantCumule: data.montantCumule,
        tamponsAcquis: data.tamponsAcquis,
        recompenseDisponible: data.recompenseDisponible,
        dateExpiration: data.dateExpiration,
      });
      setTelephoneVerifie(telephone);
      onTokenChange(token);
      if (!telephoneCommande.trim()) onPrefillTelephone(telephone);
      setEtape("verifie");
    } catch {
      setEtape("indisponible");
      setErreur("Impossible de récupérer ton solde fidélité pour le moment.");
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerCode() {
    setErreur(null);
    const telephone = normaliserTelephone(telephoneSaisi);
    if (!telephone) {
      setErreur("Numéro de téléphone invalide.");
      return;
    }
    setEnCours(true);
    setEtape("envoi");
    try {
      const reponse = await fetch("/api/fidelite/otp/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Impossible d'envoyer le code, réessaie.");
        setEtape("saisie");
        return;
      }
      setCooldown(DUREE_COOLDOWN_RENVOI);
      setEtape("code");
    } catch {
      setErreur("Erreur réseau, réessaie.");
      setEtape("saisie");
    } finally {
      setEnCours(false);
    }
  }

  async function verifierCode() {
    setErreur(null);
    const telephone = normaliserTelephone(telephoneSaisi);
    if (!telephone || !/^\d{4,6}$/.test(code)) {
      setErreur("Code invalide.");
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/fidelite/otp/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone, code }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Code incorrect.");
        return;
      }
      try {
        localStorage.setItem(
          CLE_LOCALSTORAGE,
          JSON.stringify({ token: data.token, telephone: data.telephone, expireLe: data.expireLe })
        );
      } catch {
        // Rien de bloquant : la session ne survivra juste pas au rechargement.
      }
      await chargerSolde(data.token, data.telephone);
    } catch {
      setErreur("Erreur réseau, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  const recompenseUtilisable = montantPanier >= MONTANT_RECOMPENSE;

  if (etape === "repliee") {
    return (
      <div className="rounded-lg p-4 text-white" style={{ backgroundColor: "#2D5A27" }}>
        <p className="font-bold">
          🎁 {TAGLINE_FIDELITE} — cumulez et gagnez {MONTANT_RECOMPENSE}€ offerts
        </p>
        <button
          type="button"
          onClick={() => setEtape("saisie")}
          className="mt-2 w-full rounded bg-white py-2 text-sm font-semibold text-[#2D5A27]"
        >
          Voir mon solde fidélité
        </button>
        <Link href="/fidelite" className="mt-2 block text-center text-xs text-white/80 underline">
          Comment ça marche ?
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-[#FFF8F0] p-4">
      {(etape === "saisie" || etape === "envoi") && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Vérifie ton numéro pour voir tes tampons</p>
          <input
            value={telephoneSaisi}
            onChange={(e) => setTelephoneSaisi(e.target.value)}
            placeholder="0639..."
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            type="button"
            onClick={envoyerCode}
            disabled={enCours}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {etape === "envoi" ? "Envoi du code…" : "Recevoir mon code par SMS"}
          </button>
        </div>
      )}

      {etape === "code" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Code reçu par SMS</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm tracking-widest text-gray-900"
          />
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            type="button"
            onClick={verifierCode}
            disabled={enCours}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Valider
          </button>
          <div className="flex justify-between text-xs">
            <button
              type="button"
              onClick={() => setEtape("saisie")}
              className="text-gray-500 underline"
            >
              Modifier mon numéro
            </button>
            <button
              type="button"
              onClick={envoyerCode}
              disabled={cooldown > 0}
              className="text-gray-500 underline disabled:opacity-40"
            >
              {cooldown > 0 ? `Renvoyer un code (${cooldown}s)` : "Renvoyer un code"}
            </button>
          </div>
        </div>
      )}

      {etape === "verifie" && solde && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full ${i < solde.tamponsAcquis ? "bg-[#8B2020]" : "bg-gray-200"}`}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {messageFidelite({ montantCumule: solde.montantCumule, recompenseDisponible: solde.recompenseDisponible })}
          </p>
          {solde.recompenseDisponible && (
            <div className="rounded border border-[#2D5A27] bg-white p-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#2D5A27]">
                <input
                  type="checkbox"
                  checked={utiliserRecompense}
                  disabled={!recompenseUtilisable}
                  onChange={(e) => onChangeUtiliserRecompense(e.target.checked)}
                />
                Utiliser ma récompense sur cette commande (-10 €)
              </label>
              {!recompenseUtilisable && (
                <p className="mt-1 text-xs text-gray-500">Disponible à partir de 10€ de commande.</p>
              )}
            </div>
          )}
          <Link href="/fidelite" className="text-xs text-gray-500 underline">
            Comment ça marche ?
          </Link>
        </div>
      )}

      {etape === "indisponible" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{erreur ?? "Service fidélité indisponible pour le moment."}</p>
          <button type="button" onClick={() => setEtape("saisie")} className="text-sm font-semibold text-[#8B2020] underline">
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
