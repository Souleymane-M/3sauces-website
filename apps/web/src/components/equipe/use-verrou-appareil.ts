import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Verrouillage automatique de l'appareil après X secondes d'inactivité
 * (demande explicite du patron, 2026-10-19) : redéconnecte purement et
 * simplement — la tablette reste affichée (plateau toujours visible sans
 * connexion), mais il faut ressaisir un PIN pour agir, qui peut être celui
 * d'une autre personne. Pas de "session molle" à réactiver : plus sûr, et
 * ça garantit que l'horodatage de la prochaine action est attribué à qui
 * vient réellement de taper son code.
 */
export function useVerrouAppareil(actif: boolean, dureeSec: number): void {
  const router = useRouter();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!actif) return;

    async function verrouiller() {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    }

    function reinitialiser() {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(verrouiller, dureeSec * 1000);
    }

    reinitialiser();
    window.addEventListener("click", reinitialiser);
    window.addEventListener("keydown", reinitialiser);

    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      window.removeEventListener("click", reinitialiser);
      window.removeEventListener("keydown", reinitialiser);
    };
  }, [actif, dureeSec, router]);
}
