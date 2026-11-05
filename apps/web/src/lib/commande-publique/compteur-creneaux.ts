import { createServiceSupabaseClient } from "@3sauces/supabase";
import { dateMayotteIso, plageJourMayotteUtc } from "./creneau";
import { lieuPrincipalDeAdresse, libelleCreneauLieu } from "./lieux-livraison";

export interface LigneCompteurCreneau {
  lieu: string;
  /** « entre 11h00 et 11h30 », « 11h20 »… */
  creneau: string;
  nombre: number;
}

const AUTRES = "Autres adresses";

function heureMayotte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
}

/** Livraisons du jour (hors annulées) comptées par lieu et par créneau, dans l'ordre lieu puis heure. */
export async function compterLivraisonsParCreneau(date: string = dateMayotteIso()): Promise<LigneCompteurCreneau[]> {
  const supabase = createServiceSupabaseClient();
  const { debut, fin } = plageJourMayotteUtc(date);
  const { data, error } = await supabase
    .from("commandes")
    .select("adresse_livraison, heure_souhaitee")
    .eq("canal", "livraison")
    .neq("statut", "annulee")
    .gte("heure_souhaitee", debut.toISOString())
    .lt("heure_souhaitee", fin.toISOString());
  if (error) throw new Error(`compteur créneaux : ${error.message}`);

  const compte = new Map<string, LigneCompteurCreneau & { cle: string }>();
  for (const c of data ?? []) {
    if (!c.heure_souhaitee) continue;
    const heure = heureMayotte(c.heure_souhaitee);
    const lieu = lieuPrincipalDeAdresse(c.adresse_livraison);
    const nomLieu = lieu?.nom ?? AUTRES;
    const creneauFixe = lieu?.creneaux?.includes(heure) ?? false;
    const cle = `${nomLieu}|${heure}`;
    const ligne = compte.get(cle) ?? { cle, lieu: nomLieu, creneau: creneauFixe ? libelleCreneauLieu(lieu, heure) : heure.replace(":", "h"), nombre: 0 };
    ligne.nombre += 1;
    compte.set(cle, ligne);
  }
  return [...compte.values()]
    .sort((a, b) => (a.lieu === AUTRES ? 1 : 0) - (b.lieu === AUTRES ? 1 : 0) || a.cle.localeCompare(b.cle))
    .map(({ lieu, creneau, nombre }) => ({ lieu, creneau, nombre }));
}
