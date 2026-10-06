"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";
import { MONTANT_RECOMPENSE, SEUIL_RECOMPENSE, messageFidelite } from "@/lib/fidelite/regles";

const CLE_LOCALSTORAGE = "3sauces_fidelite_identite";

interface SoldeFidelite {
  montantCumule: number;
  tamponsAcquis: number;
  recompenseDisponible: boolean;
  dateExpiration: string | null;
}

interface IdentiteStockee {
  telephone: string;
  email: string;
}

type Etape = "repliee" | "saisie" | "verifie" | "introuvable";

interface CarteFideliteProps {
  montantPanier: number;
  utiliserRecompense: boolean;
  onChangeUtiliserRecompense: (valeur: boolean) => void;
  onSoldeVerifie: (verifie: boolean, telephone?: string, email?: string) => void;
  onPrefillTelephone: (telephone: string) => void;
  /** Téléphone/email déjà saisis dans le formulaire de commande (E.164 pour le téléphone, brut pour l'email) — dès que les deux sont valides, on vérifie discrètement en arrière-plan si un solde existe, sans attendre que le client pense à cliquer "Voir mon solde". */
  telephoneCommande: string;
  emailCommande: string;
}

/**
 * Solde fidélité par téléphone + email, affiché directement sur le site —
 * plus de code reçu par SMS (abandonné le 2026-10-05 : trop de clientes ne
 * recevaient jamais le SMS, "distraction" inutile pour un simple affichage
 * de solde). La dernière identité saisie est gardée en localStorage pour
 * un réaffichage immédiat à la prochaine visite — rien de sensible à
 * protéger ici (pas de jeton, juste un confort de pré-remplissage).
 */
export function CarteFidelite({
  montantPanier,
  utiliserRecompense,
  onChangeUtiliserRecompense,
  onSoldeVerifie,
  onPrefillTelephone,
  telephoneCommande,
  emailCommande,
}: CarteFideliteProps) {
  const [etape, setEtape] = useState<Etape>("repliee");
  const [telephoneSaisi, setTelephoneSaisi] = useState("");
  const [emailSaisi, setEmailSaisi] = useState("");
  const [solde, setSolde] = useState<SoldeFidelite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const dejaMonte = useRef(false);

  useEffect(() => {
    if (dejaMonte.current) return;
    dejaMonte.current = true;
    try {
      const brut = localStorage.getItem(CLE_LOCALSTORAGE);
      if (!brut) return;
      const identite = JSON.parse(brut) as IdentiteStockee;
      if (identite.telephone && identite.email) {
        chargerSolde(identite.telephone, identite.email);
      }
    } catch {
      // localStorage indisponible (navigation privée stricte, quota) : on
      // dégrade simplement vers l'écran de saisie, jamais bloquant.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vérification silencieuse dès que le client a rempli téléphone + email
  // dans le formulaire de commande lui-même — jamais d'erreur affichée ici
  // (un nouveau client sans historique n'a rien fait de "faux"), juste un
  // passage direct à "verifie" si un solde existe. Ne se déclenche que tant
  // que le client n'a pas commencé à interagir manuellement avec la carte
  // fidélité (etape encore "repliee"), pour ne jamais interférer avec une
  // saisie en cours dans le petit formulaire dédié.
  useEffect(() => {
    if (etape !== "repliee") return;
    const telephone = normaliserTelephone(telephoneCommande);
    const email = normaliserEmail(emailCommande);
    if (!telephone || !email) return;
    let annule = false;
    const minuteur = setTimeout(async () => {
      if (annule) return;
      try {
        const reponse = await fetch("/api/fidelite/solde", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telephone, email }),
        });
        if (annule || !reponse.ok) return;
        const data = await reponse.json();
        if (annule) return;
        setSolde({
          montantCumule: data.montantCumule,
          tamponsAcquis: data.tamponsAcquis,
          recompenseDisponible: data.recompenseDisponible,
          dateExpiration: data.dateExpiration,
        });
        setTelephoneSaisi(telephone);
        setEmailSaisi(email);
        onSoldeVerifie(true, telephone, email);
        setEtape("verifie");
      } catch {
        // Échec silencieux : la carte reste repliée, le client peut toujours
        // vérifier manuellement via "Voir mon solde fidélité".
      }
    }, 500);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telephoneCommande, emailCommande, etape]);

  async function chargerSolde(telephoneBrut: string, emailBrut: string) {
    setErreur(null);
    setTelephoneSaisi(telephoneBrut);
    setEmailSaisi(emailBrut);
    const telephone = normaliserTelephone(telephoneBrut);
    const email = normaliserEmail(emailBrut);
    if (!telephone || !email) {
      setErreur("Numéro de téléphone ou email invalide.");
      setEtape("saisie");
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/fidelite/solde", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone, email }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Numéro de téléphone ou email incorrect.");
        setEtape("introuvable");
        onSoldeVerifie(false);
        return;
      }
      setSolde({
        montantCumule: data.montantCumule,
        tamponsAcquis: data.tamponsAcquis,
        recompenseDisponible: data.recompenseDisponible,
        dateExpiration: data.dateExpiration,
      });
      try {
        localStorage.setItem(CLE_LOCALSTORAGE, JSON.stringify({ telephone, email }));
      } catch {
        // Rien de bloquant : juste pas de pré-remplissage la prochaine fois.
      }
      onPrefillTelephone(telephone);
      onSoldeVerifie(true, telephone, email);
      setEtape("verifie");
    } catch {
      setErreur("Erreur réseau, réessaie.");
      setEtape("introuvable");
      onSoldeVerifie(false);
    } finally {
      setEnCours(false);
    }
  }

  const recompenseUtilisable = montantPanier >= MONTANT_RECOMPENSE;

  if (etape === "repliee") {
    return (
      <div className="rounded-lg p-4 text-white" style={{ backgroundColor: "#2D5A27" }}>
        <p className="font-bold">
          🎁 {MONTANT_RECOMPENSE}€ dépensés = 1 tampon. {SEUIL_RECOMPENSE / MONTANT_RECOMPENSE} tampons ={" "}
          {MONTANT_RECOMPENSE}€ offerts.
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
      {(etape === "saisie" || etape === "introuvable") && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Ton numéro et ton email pour voir tes tampons</p>
          <input
            value={telephoneSaisi}
            onChange={(e) => setTelephoneSaisi(e.target.value)}
            placeholder="0639... (ou +33... pour un numéro métropolitain)"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
          <input
            value={emailSaisi}
            onChange={(e) => setEmailSaisi(e.target.value)}
            type="email"
            placeholder="ton@email.com"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            type="button"
            onClick={() => chargerSolde(telephoneSaisi, emailSaisi)}
            disabled={enCours}
            className="w-full rounded bg-[#8B2020] py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enCours ? "Vérification…" : "Voir mon solde"}
          </button>
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
                <p className="mt-1 text-xs text-gray-500">Disponible à partir de {MONTANT_RECOMPENSE}€ de commande.</p>
              )}
            </div>
          )}
          <Link href="/fidelite" className="text-xs text-gray-500 underline">
            Comment ça marche ?
          </Link>
        </div>
      )}
    </div>
  );
}
