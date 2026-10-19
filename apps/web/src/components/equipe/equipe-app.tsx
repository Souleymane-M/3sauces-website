"use client";

import { useEffect, useRef, useState } from "react";
import type { Role, RoleMetier } from "@3sauces/supabase";
import type { CommandeTableauPublic } from "@/lib/equipe/tableau-public";
import { LIBELLES_STATUT } from "@/lib/cuisine/types";
import { PinPad } from "@/components/auth/pin-pad";
import { PasswordForm } from "@/components/auth/password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { CuisineView } from "./cuisine-view";
import { ComptoirView } from "./comptoir-view";
import { PilotageView } from "./pilotage-view";
import { useVerrouAppareil } from "./use-verrou-appareil";

const INTERVALLE_POLLING_MS = 5000;

const LIBELLES_ROLE_METIER: Record<RoleMetier, string> = {
  cuisine: "Cuisine",
  comptoir: "Comptoir",
  livreur: "Livreur",
  patron: "Pilotage",
};

interface SessionEquipe {
  profilId: string;
  nom: string;
  role: Role;
  rolesMetier: RoleMetier[];
}

interface EquipeAppProps {
  session: SessionEquipe | null;
  tableauInitial: CommandeTableauPublic[];
  seuilAlerteMin: number;
  dureeVerrouillageSec: number;
}

function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function resumeLignes(lignes: CommandeTableauPublic["lignes"]): string {
  if (lignes.length === 0) return "—";
  return lignes.map((l) => `${l.quantite}x ${l.nom}`).join(", ");
}

/** Plateau partagé, visible sans connexion — jamais de nom, téléphone, adresse ni prix ici. */
function Plateau({ commandes }: { commandes: CommandeTableauPublic[] }) {
  if (commandes.length === 0) {
    return <p className="mt-6 text-center text-gray-500">Aucune commande active.</p>;
  }
  return (
    <div className="mt-6 space-y-2">
      {commandes.map((c) => (
        <div key={c.numero} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div>
            <span className="text-lg font-bold text-black">#{String(c.numero).padStart(4, "0")}</span>
            <span className="ml-3 text-sm text-gray-700">{resumeLignes(c.lignes)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{formaterHeure(c.heureSouhaitee)}</span>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
              {LIBELLES_STATUT[c.statut]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EquipeApp({ session, tableauInitial, seuilAlerteMin, dureeVerrouillageSec }: EquipeAppProps) {
  const [tableau, setTableau] = useState(tableauInitial);
  const [vuePatronMotDePasse, setVuePatronMotDePasse] = useState(false);
  const [roleActif, setRoleActif] = useState<RoleMetier | null>(session?.rolesMetier[0] ?? null);
  const enVol = useRef(false);

  useVerrouAppareil(session !== null, dureeVerrouillageSec);

  useEffect(() => {
    const intervalle = setInterval(async () => {
      if (enVol.current) return;
      enVol.current = true;
      try {
        const res = await fetch("/api/equipe/tableau");
        if (res.ok) {
          const data = await res.json();
          setTableau(data.commandes);
        }
      } finally {
        enVol.current = false;
      }
    }, INTERVALLE_POLLING_MS);
    return () => clearInterval(intervalle);
  }, []);

  const vueActiveConstruite = roleActif === "cuisine" || roleActif === "comptoir" || roleActif === "patron";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-black">Équipe — 3 Sauces</h1>
        {session && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">
              Connecté : <strong>{session.nom}</strong>
            </span>
            <LogoutButton />
          </div>
        )}
      </div>

      {session && session.rolesMetier.length > 0 && (
        <div className="mt-4 flex gap-2">
          {session.rolesMetier.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleActif(r)}
              className={`rounded px-4 py-2 text-sm font-semibold ${
                roleActif === r ? "bg-black text-white" : "border border-gray-300 text-gray-700"
              }`}
            >
              {LIBELLES_ROLE_METIER[r]}
            </button>
          ))}
        </div>
      )}

      {session && roleActif === "cuisine" && <CuisineView profilId={session.profilId} seuilAlerteMin={seuilAlerteMin} />}
      {session && roleActif === "comptoir" && <ComptoirView profilId={session.profilId} />}
      {session && roleActif === "patron" && <PilotageView />}
      {session && roleActif && !vueActiveConstruite && (
        <p className="mt-3 text-sm text-gray-500">
          Vue « {LIBELLES_ROLE_METIER[roleActif]} » — pas encore construite dans l&apos;interface équipe unifiée.
        </p>
      )}

      {!session && (
        <div className="mt-8 flex flex-col items-center gap-6">
          {!vuePatronMotDePasse ? (
            <>
              <PinPad titre="Connexion — code PIN" />
              <button
                type="button"
                onClick={() => setVuePatronMotDePasse(true)}
                className="text-sm text-gray-500 underline"
              >
                Connexion patron (mot de passe)
              </button>
            </>
          ) : (
            <>
              <PasswordForm />
              <button
                type="button"
                onClick={() => setVuePatronMotDePasse(false)}
                className="text-sm text-gray-500 underline"
              >
                ← Revenir au code PIN
              </button>
            </>
          )}
        </div>
      )}

      {!vueActiveConstruite && <Plateau commandes={tableau} />}
    </div>
  );
}
