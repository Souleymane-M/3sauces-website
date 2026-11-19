/** Profil déclaré par le client (jamais déduit) : sert à cibler les e-mails et les offres. */
export const PROFILS_CLIENT = [
  { valeur: "etudiant", libelle: "Étudiant(e)" },
  { valeur: "lyceen_collegien", libelle: "Lycéen(ne) / collégien(ne)" },
  { valeur: "enseignant_personnel", libelle: "Enseignant(e) / personnel de l'établissement" },
  { valeur: "salarie", libelle: "Salarié(e) (entreprise, administration…)" },
  { valeur: "autre", libelle: "Autre" },
] as const;

export type ProfilClient = (typeof PROFILS_CLIENT)[number]["valeur"];

export function lireProfilClient(valeur: unknown): ProfilClient | null {
  return PROFILS_CLIENT.some((p) => p.valeur === valeur) ? (valeur as ProfilClient) : null;
}
