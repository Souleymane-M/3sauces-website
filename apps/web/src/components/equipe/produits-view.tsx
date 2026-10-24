"use client";

import { useEffect, useState } from "react";
import { ProduitsApp } from "@/components/patron/produits-app";
import type { ProduitAdmin } from "@/lib/patron/produits-types";

/**
 * Réutilise tel quel ProduitsApp (même écran complet que /patron) — seule
 * différence : chargement du catalogue côté client au montage, puisque
 * l'interface équipe est un unique composant client (session résolue au
 * login, pas de fetch serveur par rôle actif). L'API `/api/patron/produits`
 * accepte désormais le rôle métier "produits" en plus du patron réel, cf.
 * requireRoleMetier.
 */
export function ProduitsView() {
  const [produits, setProduits] = useState<ProduitAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patron/produits", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.produits)) setProduits(data.produits);
        else setErreur(data.error ?? "Échec du chargement.");
      })
      .catch(() => setErreur("Erreur réseau, réessaie."));
  }, []);

  if (erreur) return <p className="mt-4 text-sm text-red-600">{erreur}</p>;
  if (!produits) return <p className="mt-4 text-gray-500">Chargement…</p>;

  return <ProduitsApp produitsInitiaux={produits} />;
}
