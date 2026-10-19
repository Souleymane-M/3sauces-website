import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import type { Canal } from "@3sauces/supabase";
import { plageJourMayotteUtc, dateMayotteIso } from "@/lib/commande-publique/creneau";
import { chargerSeuil } from "./seuils";

/**
 * Les 4 durées du chantier "interface équipe" (section 5 du cahier des
 * charges) : chaque durée vient d'un couple d'événements dans
 * `commandes_evenements` (ou de l'heure de départ du chronomètre pour la
 * première). "pris_par_livreur"/"livre" n'existent que pour une livraison
 * — les durées 3 et 4 restent donc toujours vides pour sur place/à
 * emporter, jamais une erreur.
 */
export interface StatistiquesDurees {
  attenteCuisineMin: { moyenne: number | null; mediane: number | null; n: number };
  preparationMin: { moyenne: number | null; mediane: number | null; n: number };
  attenteLivreurMin: { moyenne: number | null; mediane: number | null; n: number };
  trajetMin: { moyenne: number | null; mediane: number | null; n: number };
  retardMoyenMin: number | null;
  nCommandes: number;
}

function moyenne(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return Math.round((valeurs.reduce((s, v) => s + v, 0) / valeurs.length) * 10) / 10;
}

function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const resultat = triees.length % 2 === 0 ? (triees[milieu - 1] + triees[milieu]) / 2 : triees[milieu];
  return Math.round(resultat * 10) / 10;
}

/** Lundi (Mayotte) de la semaine contenant `dateIso` ("YYYY-MM-DD"). */
function lundiDeLaSemaine(dateIso: string): string {
  const [a, m, j] = dateIso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const jourSemaine = d.getUTCDay(); // 0 = dimanche
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

function ajouterJours(dateIso: string, n: number): string {
  const [a, m, j] = dateIso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface CommandePourStats {
  id: string;
  canal: Canal;
  statut: string;
  created_at: string;
  heure_souhaitee: string | null;
}

/**
 * Calcule les 4 durées + le retard moyen pour les commandes créées (ou
 * souhaitées) entre `debutIso` et `finIso` (dates Mayotte "YYYY-MM-DD",
 * bornes incluses), filtrables par canal. Exclut toujours les commandes
 * "à venir" (jour de retrait futur au moment du calcul) — jamais dans les
 * statistiques d'attente, comme demandé.
 */
export async function calculerStatistiquesDurees(
  debutIso: string,
  finIso: string,
  canal?: Canal
): Promise<StatistiquesDurees> {
  const supabase = createServiceSupabaseClient();
  const delaiPrepMin = await chargerSeuil("delai_preparation_standard_min", 15);

  const { debut } = plageJourMayotteUtc(debutIso);
  const { fin } = plageJourMayotteUtc(finIso);

  let requete = supabase
    .from("commandes")
    .select("id, canal, statut, created_at, heure_souhaitee")
    .gte("heure_souhaitee", debut.toISOString())
    .lt("heure_souhaitee", fin.toISOString())
    .neq("statut", "annulee");
  if (canal) requete = requete.eq("canal", canal);

  const { data: commandes, error } = await requete;
  if (error) {
    throw new Error(`Impossible de charger les commandes pour les statistiques : ${error.message}`);
  }
  const liste = (commandes ?? []) as CommandePourStats[];
  if (liste.length === 0) {
    return {
      attenteCuisineMin: { moyenne: null, mediane: null, n: 0 },
      preparationMin: { moyenne: null, mediane: null, n: 0 },
      attenteLivreurMin: { moyenne: null, mediane: null, n: 0 },
      trajetMin: { moyenne: null, mediane: null, n: 0 },
      retardMoyenMin: null,
      nCommandes: 0,
    };
  }

  const { data: evenements, error: erreurEvenements } = await supabase
    .from("commandes_evenements")
    .select("commande_id, statut, created_at")
    .in(
      "commande_id",
      liste.map((c) => c.id)
    );
  if (erreurEvenements) {
    throw new Error(`Impossible de charger les événements : ${erreurEvenements.message}`);
  }

  const evenementsParCommande = new Map<string, { statut: string; created_at: string }[]>();
  for (const e of evenements ?? []) {
    const liste2 = evenementsParCommande.get(e.commande_id) ?? [];
    liste2.push(e);
    evenementsParCommande.set(e.commande_id, liste2);
  }

  const attenteCuisine: number[] = [];
  const preparation: number[] = [];
  const attenteLivreur: number[] = [];
  const trajet: number[] = [];
  const retards: number[] = [];

  for (const c of liste) {
    const evs = evenementsParCommande.get(c.id) ?? [];
    const dateEvent = (statut: string) => evs.find((e) => e.statut === statut)?.created_at ?? null;

    // Commande "à l'avance" (jour de retrait différent du jour de création,
    // même logique que `estCommandeAvance`) : chrono démarré à
    // heure souhaitée - délai de préparation, jamais à la création.
    const avance = c.heure_souhaitee ? dateMayotteIso1(c.heure_souhaitee) !== dateMayotteIso1(c.created_at) : false;
    const chronoDepart = avance && c.heure_souhaitee
      ? new Date(new Date(c.heure_souhaitee).getTime() - delaiPrepMin * 60000)
      : new Date(c.created_at);

    const tPrep = dateEvent("en_preparation");
    const tPret = dateEvent("pret");
    const tEnlevee = dateEvent("pris_par_livreur");
    const tLivree = dateEvent("livre");
    const tRemis = dateEvent("remis_au_client");

    const diffMin = (a: string | Date, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

    if (tPrep) attenteCuisine.push(diffMin(chronoDepart, tPrep));
    if (tPrep && tPret) preparation.push(diffMin(tPrep, tPret));
    if (tPret && tEnlevee) attenteLivreur.push(diffMin(tPret, tEnlevee));
    if (tEnlevee && tLivree) trajet.push(diffMin(tEnlevee, tLivree));

    // Retard : écart entre remise réelle et heure souhaitée — jamais pour
    // une commande non terminée ni "à venir".
    const tRemise = c.canal === "livraison" ? tLivree : tRemis;
    if (!avance && tRemise && c.heure_souhaitee) {
      const ecart = diffMin(c.heure_souhaitee, tRemise);
      retards.push(Math.max(0, ecart));
    }
  }

  return {
    attenteCuisineMin: { moyenne: moyenne(attenteCuisine), mediane: mediane(attenteCuisine), n: attenteCuisine.length },
    preparationMin: { moyenne: moyenne(preparation), mediane: mediane(preparation), n: preparation.length },
    attenteLivreurMin: { moyenne: moyenne(attenteLivreur), mediane: mediane(attenteLivreur), n: attenteLivreur.length },
    trajetMin: { moyenne: moyenne(trajet), mediane: mediane(trajet), n: trajet.length },
    retardMoyenMin: moyenne(retards),
    nCommandes: liste.length,
  };
}

function dateMayotteIso1(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
}

export interface SeuilDeuxiemeLivreur {
  retardSemaineCourante: number | null;
  retardSemainePrecedente: number | null;
  seuilAtteint: boolean;
  seuilMin: number;
}

/** Alerte "seuil 2e livreur" : retard moyen (livraison uniquement) au-delà du seuil, 2 semaines de suite. */
export async function calculerSeuilDeuxiemeLivreur(): Promise<SeuilDeuxiemeLivreur> {
  const seuilMin = await chargerSeuil("seuil_retard_2e_livreur_min", 35);
  const lundiCourant = lundiDeLaSemaine(dateMayotteIso());
  const lundiPrecedent = ajouterJours(lundiCourant, -7);
  const dimancheCourant = ajouterJours(lundiCourant, 6);
  const dimanchePrecedent = ajouterJours(lundiPrecedent, 6);

  const [semaineCourante, semainePrecedente] = await Promise.all([
    calculerStatistiquesDurees(lundiCourant, dimancheCourant, "livraison"),
    calculerStatistiquesDurees(lundiPrecedent, dimanchePrecedent, "livraison"),
  ]);

  const retardSemaineCourante = semaineCourante.retardMoyenMin;
  const retardSemainePrecedente = semainePrecedente.retardMoyenMin;
  const seuilAtteint =
    retardSemaineCourante !== null &&
    retardSemainePrecedente !== null &&
    retardSemaineCourante > seuilMin &&
    retardSemainePrecedente > seuilMin;

  return { retardSemaineCourante, retardSemainePrecedente, seuilAtteint, seuilMin };
}

export interface RepartitionMotifs {
  motif: string;
  nombre: number;
}

/** Répartition des motifs de clôture manuelle (fin de service) — pour comprendre, jamais pour sanctionner qui que ce soit. */
export async function calculerRepartitionMotifs(debutIso: string, finIso: string): Promise<RepartitionMotifs[]> {
  const supabase = createServiceSupabaseClient();
  const { debut } = plageJourMayotteUtc(debutIso);
  const { fin } = plageJourMayotteUtc(finIso);

  const { data, error } = await supabase
    .from("commandes")
    .select("motif_annulation")
    .eq("statut", "annulee")
    .in("motif_annulation", ["no_show", "erreur", "annulation", "client_injoignable"])
    .gte("created_at", debut.toISOString())
    .lt("created_at", fin.toISOString());

  if (error) {
    throw new Error(`Impossible de charger les motifs : ${error.message}`);
  }

  const compteur = new Map<string, number>();
  for (const c of data ?? []) {
    if (!c.motif_annulation) continue;
    compteur.set(c.motif_annulation, (compteur.get(c.motif_annulation) ?? 0) + 1);
  }
  return Array.from(compteur.entries()).map(([motif, nombre]) => ({ motif, nombre }));
}
