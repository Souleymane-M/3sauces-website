import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { derniereActivite, noterActivite, verrouSuspendu } from "@/lib/verrou-appareil";

const EVENEMENTS = ["click", "keydown", "pointerdown", "touchstart", "scroll", "input"] as const;

/**
 * Verrouillage automatique de l'appareil après X secondes d'inactivité
 * (demande explicite du patron, 2026-10-19) : redéconnecte purement et
 * simplement — la tablette reste affichée (plateau toujours visible sans
 * connexion), mais il faut ressaisir un PIN pour agir, qui peut être celui
 * d'une autre personne. Pas de "session molle" à réactiver : plus sûr, et
 * ça garantit que l'horodatage de la prochaine action est attribué à qui
 * vient réellement de taper son code.
 *
 * Ne se déclenche jamais pendant qu'une saisie est en cours (commande en
 * cours de prise au comptoir) ni si un autre onglet du même appareil
 * (/caisse) a été utilisé récemment — le cookie de session est partagé, le
 * supprimer coupait la caisse en plein encaissement (2026-10-29).
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

    function planifier(delaiMs: number) {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(verifier, delaiMs);
    }

    function verifier() {
      const inactifDepuisMs = Date.now() - derniereActivite();
      if (verrouSuspendu() || inactifDepuisMs < dureeSec * 1000) {
        // Encore actif (ici ou dans un autre onglet), ou saisie en cours : on revérifie plus tard.
        planifier(verrouSuspendu() ? 5000 : Math.max(1000, dureeSec * 1000 - inactifDepuisMs));
        return;
      }
      verrouiller();
    }

    function activite() {
      noterActivite();
    }

    noterActivite();
    planifier(dureeSec * 1000);
    for (const e of EVENEMENTS) window.addEventListener(e, activite, { passive: true, capture: true });

    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      for (const e of EVENEMENTS) window.removeEventListener(e, activite, { capture: true });
    };
  }, [actif, dureeSec, router]);
}
