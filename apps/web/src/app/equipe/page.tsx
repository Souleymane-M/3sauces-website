import type { Metadata } from "next";
import { getSession } from "@/lib/auth/get-session";
import { listerTableauPublic } from "@/lib/equipe/tableau-public";
import { EquipeApp } from "@/components/equipe/equipe-app";

export const metadata: Metadata = {
  title: "Équipe — 3 Sauces",
};

/**
 * Point d'entrée unique de l'interface équipe unifiée (chantier 2026-10-19).
 * Le plateau est lu AVANT toute vérification de session — il doit rester
 * visible en permanence sur une tablette fixe sans connexion (demande
 * explicite du patron) : `listerTableauPublic` garantit déjà qu'aucun champ
 * sensible n'est sélectionné en base, donc rien à filtrer ici.
 */
export default async function EquipePage() {
  const [session, tableau] = await Promise.all([getSession(), listerTableauPublic()]);

  return (
    <main className="min-h-screen bg-white p-4">
      <EquipeApp
        session={
          session ? { nom: session.nom, role: session.role, rolesMetier: session.rolesMetier } : null
        }
        tableauInitial={tableau}
      />
    </main>
  );
}
