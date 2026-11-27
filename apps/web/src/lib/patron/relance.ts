import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { MONTANT_RECOMPENSE, NB_TAMPONS_RECOMPENSE } from "@/lib/fidelite/regles";
import { construireEmailClientHtml } from "@/lib/notifications/template";

/** « relance » : sans commande depuis X jours ; « recompense » : au moins une récompense disponible ; « points » : au moins 1 point de fidélité (ou une récompense). */
export type ModeRelance = "relance" | "recompense" | "points" | "tous";
export type ModeRelanceEtendu = ModeRelance | "reviens" | "actifs";
// « reviens » : sans commande depuis `jours` jours OU une seule commande ; « actifs » : le reste (commande récente et au moins 2 commandes).

export const SOURCE_RELANCE = "relance_client";
const TEXTE_CONSENTEMENT_RELANCE =
  "Client existant (a déjà commandé) — email de relance fidélité envoyé sans case cochée ; désinscription possible à chaque envoi.";

export interface ClientRelance {
  telephone: string;
  email: string;
  prenom: string | null;
  nbCommandes: number;
  derniereCommande: string | null;
  joursDepuis: number | null;
  recompenses: number;
  prochaineExpiration: string | null;
  tampons: number;
  /** Euros cumulés pas encore convertis en récompense — sert à dire combien il manque avant le prochain point. */
  montantCumule: number;
}

const TAILLE_PAGE = 1000;

async function toutLire<T>(lire: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const resultat: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await lire(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    resultat.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) break;
  }
  return resultat;
}

/** Clients avec email, non désinscrits, qui correspondent au mode demandé — les plus anciens à relancer d'abord. */
export async function listerClientsRelance(mode: ModeRelanceEtendu, jours: number): Promise<ClientRelance[]> {
  const supabase = createServiceSupabaseClient();
  const maintenant = Date.now();

  const [clients, commandes, tampons, desinscrits] = await Promise.all([
    toutLire((d, f) =>
      supabase.from("clients").select("telephone, email, prenom, montant_cumule").not("email", "is", null).order("telephone").range(d, f)
    ),
    toutLire((d, f) =>
      supabase
        .from("commandes")
        .select("id, client_telephone, created_at")
        .neq("statut", "annulee")
        .not("client_telephone", "is", null)
        .order("id")
        .range(d, f)
    ),
    toutLire((d, f) =>
      supabase
        .from("fidelite_tampons")
        .select("id, client_telephone, date_expiration")
        .eq("utilise", false)
        .is("commande_reservation_id", null)
        .gt("date_expiration", new Date().toISOString())
        .order("id")
        .range(d, f)
    ),
    toutLire((d, f) =>
      supabase.from("inscriptions_information").select("id, email").not("desinscrit_le", "is", null).order("id").range(d, f)
    ),
  ]);

  const exclus = new Set(desinscrits.map((i) => i.email.toLowerCase()));
  const parClient = new Map<string, { nb: number; derniere: string }>();
  for (const c of commandes) {
    if (!c.client_telephone) continue;
    const actuel = parClient.get(c.client_telephone);
    if (!actuel) parClient.set(c.client_telephone, { nb: 1, derniere: c.created_at });
    else {
      actuel.nb += 1;
      if (c.created_at > actuel.derniere) actuel.derniere = c.created_at;
    }
  }
  const recompensesParClient = new Map<string, string[]>();
  for (const t of tampons) {
    const liste = recompensesParClient.get(t.client_telephone) ?? [];
    liste.push(t.date_expiration);
    recompensesParClient.set(t.client_telephone, liste);
  }

  const resultat: ClientRelance[] = [];
  for (const c of clients) {
    if (!c.email || exclus.has(c.email.toLowerCase())) continue;
    const stats = parClient.get(c.telephone);
    const expirations = (recompensesParClient.get(c.telephone) ?? []).sort();
    const joursDepuis = stats ? Math.floor((maintenant - new Date(stats.derniere).getTime()) / 86_400_000) : null;

    const tamponsClient = Math.floor((c.montant_cumule ?? 0) / MONTANT_RECOMPENSE);
    if (mode === "recompense") {
      if (expirations.length === 0) continue;
    } else if (mode === "tous") {
      if (joursDepuis === null) continue;
    } else if (mode === "reviens") {
      if (joursDepuis === null || !(joursDepuis >= jours || (stats?.nb ?? 0) <= 1)) continue;
    } else if (mode === "actifs") {
      if (joursDepuis === null || joursDepuis >= jours || (stats?.nb ?? 0) <= 1) continue;
    } else if (mode === "points") {
      if (expirations.length === 0 && tamponsClient < 1) continue;
    } else if (joursDepuis === null || joursDepuis < jours) {
      continue;
    }

    resultat.push({
      telephone: c.telephone,
      email: c.email,
      prenom: c.prenom,
      nbCommandes: stats?.nb ?? 0,
      derniereCommande: stats?.derniere ?? null,
      joursDepuis,
      recompenses: expirations.length,
      prochaineExpiration: expirations[0] ?? null,
      tampons: Math.floor((c.montant_cumule ?? 0) / MONTANT_RECOMPENSE),
      montantCumule: c.montant_cumule ?? 0,
    });
  }

  return resultat.sort((a, b) => (b.joursDepuis ?? 0) - (a.joursDepuis ?? 0) || a.telephone.localeCompare(b.telephone));
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", day: "numeric", month: "long" }).format(new Date(iso));

/**
 * Phrase fidélité propre à chaque client, insérée à la place de `{fidelite}`.
 * Jamais de décision à sa place : on lui dit seulement ce qu'il a, il l'utilise quand il veut.
 */
export function phraseFidelite(c: Pick<ClientRelance, "recompenses" | "prochaineExpiration" | "tampons">): string {
  const manque = Math.max(1, NB_TAMPONS_RECOMPENSE - (c.tampons % NB_TAMPONS_RECOMPENSE));
  const prochaine = `Encore ${manque} point${manque > 1 ? "s" : ""} de fidélité pour avoir ${MONTANT_RECOMPENSE} € de récompense en plus.`;
  if (c.recompenses > 0) {
    const montant = c.recompenses * MONTANT_RECOMPENSE;
    const pluriel = c.recompenses > 1;
    const fin = c.prochaineExpiration
      ? pluriel
        ? ` Les premiers expirent le ${dateFr(c.prochaineExpiration)}.`
        : ` Valable jusqu'au ${dateFr(c.prochaineExpiration)}.`
      : "";
    return `🎁 Tu as ${montant} € de récompense disponible${pluriel ? "s" : ""}, à utiliser quand tu veux sur ta prochaine commande (sur 3sauces.fr, par téléphone ou au comptoir).${fin} ${prochaine}`;
  }
  const points = c.tampons;
  return `🎁 Tu as ${points} point${points > 1 ? "s" : ""} de fidélité. Encore ${manque} point${manque > 1 ? "s" : ""} de fidélité pour avoir ${MONTANT_RECOMPENSE} € de récompense.`;
}

/** Fin de phrase du mail du lundi : « tu as 4 points de fidélité, il t'en manque 6 pour 10 € offerts ». */
export function phrasePointsLundi(c: Pick<ClientRelance, "recompenses" | "prochaineExpiration" | "tampons" | "montantCumule">): string {
  const manque = Math.max(1, NB_TAMPONS_RECOMPENSE - (c.tampons % NB_TAMPONS_RECOMPENSE));
  const pts = (n: number) => `${n} point${n > 1 ? "s" : ""}`;
  if (c.recompenses > 0) {
    const fin = c.prochaineExpiration ? ` (valable jusqu'au ${dateFr(c.prochaineExpiration)})` : "";
    return `tu as ${c.recompenses * MONTANT_RECOMPENSE} € de récompense disponible${c.recompenses > 1 ? "s" : ""}${fin}, et il t'en manque ${pts(manque)} de fidélité pour ${MONTANT_RECOMPENSE} € de plus`;
  }
  if (c.tampons === 0) {
    const reste = MONTANT_RECOMPENSE - (c.montantCumule % MONTANT_RECOMPENSE);
    return `plus que ${reste.toFixed(2).replace(".", ",")} € pour gagner ton premier point de fidélité`;
  }
  return `tu as ${pts(c.tampons)} de fidélité, il t'en manque ${manque} pour ${MONTANT_RECOMPENSE} € offerts`;
}

/** Dernière phrase du mail du lundi : elle pousse à commander, avec un angle qui dépend de la situation du client. */
export function phraseInvitationLundi(c: Pick<ClientRelance, "recompenses" | "tampons">): string {
  if (c.recompenses > 0) return "Utilise-la sur ta prochaine commande : saisis ton numéro et ton e-mail au moment de commander sur 3sauces.fr.";
  if (c.tampons >= 1) return "Chaque 10 € dépensés te rapproche de ta récompense : commande dès aujourd'hui sur 3sauces.fr.";
  return "Une seule commande suffit pour y arriver : commande dès aujourd'hui sur 3sauces.fr.";
}

export function personnaliserMessage(modele: string, c: ClientRelance): string {
  return modele
    .replaceAll("{prenom}", c.prenom?.trim() || "")
    .replaceAll("{fidelite}", phraseFidelite(c))
    .replaceAll("{pointsfidelite}", phrasePointsLundi(c))
    .replaceAll("{invitation}", phraseInvitationLundi(c))
    .replace(/^ +,/gm, ",")
    .replace(/Bonjour ,/g, "Bonjour,");
}

/** Jeton de désinscription du client (créé au premier envoi). Renvoie null s'il s'est déjà désinscrit. */
export async function jetonDesinscription(email: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const adresse = email.trim().toLowerCase();
  const { data: existant } = await supabase
    .from("inscriptions_information")
    .select("jeton_desinscription, desinscrit_le")
    .eq("email", adresse)
    .maybeSingle();
  if (existant) return existant.desinscrit_le ? null : existant.jeton_desinscription;

  const { data, error } = await supabase
    .from("inscriptions_information")
    .insert({ email: adresse, accepte_offres: false, texte_consentement: TEXTE_CONSENTEMENT_RELANCE, source: SOURCE_RELANCE })
    .select("jeton_desinscription")
    .single();
  if (error) throw new Error(error.message);
  return data.jeton_desinscription;
}

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Corps HTML d'un e-mail de campagne : message, pied de page avec lien de désinscription, bouton étiqueté `?src=email-…`. */
export function construireHtmlCampagne(message: string, jeton: string, campagne: string | null, offre?: string): string {
  const corps = echapper(message).replace(/\n/g, "<br>");
  const lien = `https://3sauces.fr/desinscription?jeton=${jeton}`;
  return construireEmailClientHtml(
    `<p>${corps}</p><p style="margin-top:24px;font-size:12px;color:#777777;">Vous recevez cet email car vous avez déjà commandé chez 3 Sauces et disposez d'un compte fidélité.<br><a href="${lien}" style="color:#8B2020;">Me désinscrire</a></p>`,
    "Commander",
    campagne ? `https://3sauces.fr/?src=email-${campagne}${offre ? `&offre=${offre}` : ""}` : undefined
  );
}
