import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";

export interface MetriquesGroupe {
  nombreGroupe3: number;
  nombreGroupe4: number;
  chiffreAffaires: number;
  panierMoyen: number;
}

const FENETRE_JOURS = 7;

/**
 * Suivi de l'offre "commande groupée avant 11h" sur les 7 derniers jours —
 * uniquement ce qui est réellement dérivable de `commandes.palier_groupe`
 * (posé une fois à la soumission, cf. migration palier_groupe). Le nombre
 * de plats livrés par déplacement et les retards/réclamations ne sont pas
 * suivis ici : aucune donnée exploitable en base pour ces deux points.
 */
export async function calculerMetriquesGroupe(): Promise<MetriquesGroupe> {
  const supabase = createServiceSupabaseClient();
  const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("commandes")
    .select("palier_groupe, montant")
    .not("palier_groupe", "is", null)
    .gte("created_at", depuis);

  if (error) {
    throw new Error(`Impossible de calculer les métriques commande groupée : ${error.message}`);
  }

  const commandes = data ?? [];
  const nombreGroupe3 = commandes.filter((c) => c.palier_groupe === "GROUPE_3").length;
  const nombreGroupe4 = commandes.filter((c) => c.palier_groupe === "GROUPE_4").length;
  const chiffreAffaires = Math.round(commandes.reduce((total, c) => total + c.montant, 0) * 100) / 100;
  const panierMoyen = commandes.length > 0 ? Math.round((chiffreAffaires / commandes.length) * 100) / 100 : 0;

  return { nombreGroupe3, nombreGroupe4, chiffreAffaires, panierMoyen };
}
