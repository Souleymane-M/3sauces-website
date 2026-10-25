/** Coupures et pièces de l'euro, en centimes — clé du billetage enregistré en base. */
export const COUPURES_CENTIMES = [
  { valeur: 10000, libelle: "Billet 100 €" },
  { valeur: 5000, libelle: "Billet 50 €" },
  { valeur: 2000, libelle: "Billet 20 €" },
  { valeur: 1000, libelle: "Billet 10 €" },
  { valeur: 500, libelle: "Billet 5 €" },
  { valeur: 200, libelle: "Pièce 2 €" },
  { valeur: 100, libelle: "Pièce 1 €" },
  { valeur: 50, libelle: "Pièce 50 c" },
  { valeur: 20, libelle: "Pièce 20 c" },
  { valeur: 10, libelle: "Pièce 10 c" },
  { valeur: 5, libelle: "Pièce 5 c" },
  { valeur: 2, libelle: "Pièce 2 c" },
  { valeur: 1, libelle: "Pièce 1 c" },
] as const;

export type Billetage = Record<string, number>;

/** Somme d'un billetage en euros ; null si une clé est inconnue ou un nombre invalide. */
export function totalBilletage(detail: unknown): number | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const valides = new Set<string>(COUPURES_CENTIMES.map((c) => String(c.valeur)));
  let centimes = 0;
  for (const [cle, nombre] of Object.entries(detail as Record<string, unknown>)) {
    if (!valides.has(cle)) return null;
    if (typeof nombre !== "number" || !Number.isInteger(nombre) || nombre < 0 || nombre > 10000) return null;
    centimes += Number(cle) * nombre;
  }
  return centimes / 100;
}

export interface MouvementCaisse {
  id: string;
  type: "ouverture" | "sortie" | "cloture";
  montant: number;
  motif: string | null;
  attendu: number | null;
  ecart: number | null;
  profilNom: string | null;
  creeLe: string;
  annule: boolean;
}

export interface EtatTiroir {
  date: string;
  ouverture: MouvementCaisse | null;
  cloture: MouvementCaisse | null;
  sorties: MouvementCaisse[];
}
