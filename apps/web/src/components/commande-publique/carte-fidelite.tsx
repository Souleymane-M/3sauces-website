"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { normaliserTelephone } from "@/lib/telephone";
import { normaliserEmail } from "@/lib/email";
import { MONTANT_RECOMPENSE, messageSoldeFidelite } from "@/lib/fidelite/regles";

interface SoldeTampons {
  nombre: number;
  prochaineExpiration: string | null;
  montantCumule: number;
}

type Etape = "saisie" | "verifie" | "nouveau_client" | "email_manquant";

interface CarteFideliteProps {
  montantPanier: number;
  nbTampons: number;
  onChangeNbTampons: (valeur: number) => void;
  onSoldeVerifie: (verifie: boolean, telephone?: string, email?: string, tamponsDisponibles?: number) => void;
  /** Pré-remplit un champ du formulaire plus bas — jamais d'écrasement si le client a déjà saisi quelque chose lui-même. */
  onPrefillIdentite: (infos: {
    telephone: string;
    email: string;
    nom: string | null;
    prenom: string | null;
    adresse: string | null;
    zone: string | null;
  }) => void;
}

/**
 * Reconnaissance client en haut du panier (juste après le choix de mode,
 * demandé explicitement le 2026-10-14 — avant, un bloc "voir mes tampons"
 * trônait sur l'accueil à chaque visite, perçu comme une distraction avant
 * même d'avoir commencé à commander). Téléphone + email identifient le
 * client (les deux ensemble, pas un seul — un numéro seul se devine trop
 * facilement pour protéger le nom/l'adresse/les tampons de quelqu'un
 * d'autre) ; dès que les deux sont valides, la vérification se déclenche
 * automatiquement (aucun clic requis), pré-remplit nom/prénom/adresse de
 * livraison plus bas dans le formulaire (toujours modifiables), et affiche
 * les tampons immédiatement.
 */
export function CarteFidelite({
  montantPanier,
  nbTampons,
  onChangeNbTampons,
  onSoldeVerifie,
  onPrefillIdentite,
}: CarteFideliteProps) {
  const [etape, setEtape] = useState<Etape>("saisie");
  const [telephoneSaisi, setTelephoneSaisi] = useState("");
  const [emailSaisi, setEmailSaisi] = useState("");
  const [solde, setSolde] = useState<SoldeTampons | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enCoursLiaison, setEnCoursLiaison] = useState(false);
  const derniereIdentiteVerifiee = useRef<string | null>(null);

  const appliquerSucces = useCallback(
    (
      data: {
        tamponsDisponibles: number;
        prochaineExpiration: string | null;
        montantCumule: number;
        nom: string | null;
        prenom: string | null;
        derniereAdresseLivraison: string | null;
        derniereZoneLivraison: string | null;
      },
      telephone: string,
      email: string
    ) => {
      setSolde({ nombre: data.tamponsDisponibles, prochaineExpiration: data.prochaineExpiration, montantCumule: data.montantCumule });
      onSoldeVerifie(true, telephone, email, data.tamponsDisponibles);
      onPrefillIdentite({
        telephone,
        email,
        nom: data.nom ?? null,
        prenom: data.prenom ?? null,
        adresse: data.derniereAdresseLivraison ?? null,
        zone: data.derniereZoneLivraison ?? null,
      });
      setEtape("verifie");
    },
    [onSoldeVerifie, onPrefillIdentite]
  );

  // Un numéro doit toujours être lié à un email pour voir/utiliser ses
  // tampons (demande explicite du patron, 2026-10-21) : un numéro déjà
  // connu mais sans email associé (commande en caisse, email facultatif)
  // n'est jamais traité comme "nouveau client" — on propose de lier
  // l'email tapé ici à ce numéro.
  async function lierEmail() {
    const telephone = normaliserTelephone(telephoneSaisi);
    const email = normaliserEmail(emailSaisi);
    if (!telephone || !email) return;
    setEnCoursLiaison(true);
    try {
      const reponse = await fetch("/api/fidelite/lier-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone, email }),
      });
      const data = await reponse.json();
      if (!reponse.ok) return;
      appliquerSucces(data, telephone, email);
    } finally {
      setEnCoursLiaison(false);
    }
  }

  // Vérification automatique dès que les deux champs sont valides — jamais
  // besoin de cliquer sur un bouton pour voir ses tampons. Re-déclenche si
  // le client change l'un des deux champs après une première vérification
  // (ex: correction d'une faute de frappe).
  useEffect(() => {
    const telephone = normaliserTelephone(telephoneSaisi);
    const email = normaliserEmail(emailSaisi);
    if (!telephone || !email) return;
    const cle = `${telephone}|${email}`;
    if (cle === derniereIdentiteVerifiee.current) return;

    let annule = false;
    const minuteur = setTimeout(async () => {
      if (annule) return;
      setEnCours(true);
      try {
        const reponse = await fetch("/api/fidelite/solde", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telephone, email }),
        });
        if (annule) return;
        derniereIdentiteVerifiee.current = cle;
        const data = await reponse.json();
        if (annule) return;

        if (!reponse.ok) {
          // Jamais un message alarmant : la très grande majorité des échecs
          // ici sont simplement un premier client, pas une vraie erreur —
          // sauf le cas "numéro connu, email pas encore lié", distingué
          // explicitement pour proposer de le lier plutôt que de prétendre
          // qu'il n'y a pas de compte.
          setSolde(null);
          setEtape(data.raison === "email_manquant" ? "email_manquant" : "nouveau_client");
          onSoldeVerifie(false);
          return;
        }

        appliquerSucces(data, telephone, email);
      } catch {
        // Échec réseau : on ne bloque rien, le client peut continuer à taper.
      } finally {
        if (!annule) setEnCours(false);
      }
    }, 500);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [telephoneSaisi, emailSaisi, onSoldeVerifie, appliquerSucces]);

  const maxUtilisable = Math.min(solde?.nombre ?? 0, Math.floor(montantPanier / MONTANT_RECOMPENSE));
  const nbTamponsEffectif = Math.min(nbTampons, maxUtilisable);

  return (
    <div className="rounded-lg border border-gray-200 bg-[#FFF8F0] p-4">
      <p className="text-sm font-semibold text-gray-900">
        Déjà client·e chez 3 Sauces ? Ton numéro et ton email remplissent tes infos automatiquement.
      </p>
      <div className="mt-2 space-y-2">
        <input
          value={telephoneSaisi}
          onChange={(e) => setTelephoneSaisi(e.target.value)}
          placeholder="0639123456"
          className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
        />
        <input
          value={emailSaisi}
          onChange={(e) => setEmailSaisi(e.target.value)}
          type="email"
          placeholder="ton@email.com"
          className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
        />
        {enCours && <p className="text-xs text-gray-500">Vérification…</p>}
      </div>

      {etape === "nouveau_client" && (
        <p className="mt-2 text-xs text-gray-500">
          Pas encore de compte avec ces infos — pas de souci, remplis le reste du formulaire, tout sera enregistré
          pour la prochaine fois.
        </p>
      )}

      {etape === "email_manquant" && (
        <div className="mt-2 rounded border border-[#8B2020]/30 bg-white p-2">
          <p className="text-xs text-gray-700">
            On connaît ce numéro, mais aucun email n&apos;y est encore associé — nécessaire pour voir et utiliser tes
            tampons.
          </p>
          <button
            type="button"
            onClick={lierEmail}
            disabled={enCoursLiaison}
            className="mt-2 rounded bg-[#8B2020] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {enCoursLiaison ? "…" : `Associer ${emailSaisi.trim()} à ce numéro`}
          </button>
        </div>
      )}

      {etape === "verifie" && solde && (
        <div className="mt-2 space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            {messageSoldeFidelite(solde.montantCumule, { nombre: solde.nombre, prochaineExpiration: solde.prochaineExpiration })}
          </p>
          {solde.nombre > 0 && (
            <div className="rounded border border-[#2D5A27] bg-white p-2">
              <p className="text-sm font-semibold text-[#2D5A27]">Combien utiliser sur cette commande ?</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangeNbTampons(Math.max(0, nbTamponsEffectif - 1))}
                  disabled={nbTamponsEffectif === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2D5A27] text-[#2D5A27] disabled:opacity-30"
                >
                  -
                </button>
                <span className="w-24 text-center text-sm font-semibold">
                  {(nbTamponsEffectif * MONTANT_RECOMPENSE).toFixed(2)} €
                </span>
                <button
                  type="button"
                  onClick={() => onChangeNbTampons(Math.min(maxUtilisable, nbTamponsEffectif + 1))}
                  disabled={nbTamponsEffectif >= maxUtilisable}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2D5A27] text-[#2D5A27] disabled:opacity-30"
                >
                  +
                </button>
              </div>
              {maxUtilisable === 0 && (
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
