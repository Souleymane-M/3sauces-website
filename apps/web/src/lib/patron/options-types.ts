/**
 * Types partagés entre le serveur (lib/patron/options.ts) et le client
 * (components/patron/options-app.tsx) — séparés du fichier `server-only`
 * pour que le composant client puisse les importer sans entraîner le code
 * d'accès Supabase dans le bundle navigateur.
 */
export type TypeOption = "viandes" | "sauces" | "saveurs";

const TYPES_VALIDES = new Set<string>(["viandes", "sauces", "saveurs"]);

export function estTypeOptionValide(valeur: string): valeur is TypeOption {
  return TYPES_VALIDES.has(valeur);
}

export interface OptionAdmin {
  id: string;
  nom: string;
  actif: boolean;
  uniteDeduction?: "grammes" | "pieces";
}
