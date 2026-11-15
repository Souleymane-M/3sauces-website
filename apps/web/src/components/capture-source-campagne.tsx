"use client";

import { useEffect } from "react";
import { CLE_SOURCE_CAMPAGNE, normaliserSourceCampagne } from "@/lib/campagne";

/** Mémorise l'étiquette `?src=` de l'URL d'arrivée (dernière campagne vue gagne). Silencieux si le stockage est bloqué. */
export function CaptureSourceCampagne() {
  useEffect(() => {
    try {
      const source = normaliserSourceCampagne(new URLSearchParams(window.location.search).get("src"));
      if (source) localStorage.setItem(CLE_SOURCE_CAMPAGNE, JSON.stringify({ source, le: Date.now() }));
    } catch {
      // stockage indisponible : on perd seulement l'attribution
    }
  }, []);
  return null;
}
