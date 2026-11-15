"use client";

import { useEffect, useRef } from "react";

/**
 * Message d'erreur bien visible (cadre rouge, gras) qui s'amène tout seul au centre de l'écran : une petite ligne
 * rouge en bas de formulaire passait inaperçue, au point que la caissière ne savait pas pourquoi une commande
 * ne partait pas (demande du patron, 2026-11-15).
 */
export function MessageErreur({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      role="alert"
      className="flex items-start gap-2 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-base font-bold text-red-800"
    >
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
    </div>
  );
}
