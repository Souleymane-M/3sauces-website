"use client";

import { useEffect } from "react";
import { noterActivite } from "@/lib/verrou-appareil";

const EVENEMENTS = ["click", "keydown", "pointerdown", "touchstart", "scroll", "input"] as const;

/** Signale l'activité de cette page (/caisse) aux autres onglets, pour que le verrouillage de /equipe ne coupe pas la session en plein encaissement. */
export function ActiviteAppareil() {
  useEffect(() => {
    noterActivite();
    const actif = () => noterActivite();
    for (const e of EVENEMENTS) window.addEventListener(e, actif, { passive: true, capture: true });
    return () => {
      for (const e of EVENEMENTS) window.removeEventListener(e, actif, { capture: true });
    };
  }, []);
  return null;
}
