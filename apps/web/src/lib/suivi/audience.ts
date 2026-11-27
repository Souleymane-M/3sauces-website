import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { ajouterJoursIso, dateMayotteIso } from "@/lib/commande-publique/creneau";
import type { EtatAudience, LigneRepartition, PeriodeAudience } from "./audience-types";

async function toutLire<T>(requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const lignes: T[] = [];
  for (let o = 0; o < 50_000; o += 1000) {
    const { data, error } = await requete(o, o + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return lignes;
}

const ORDRE_ETAPES = ["accueil", "menu", "panier", "validation"];
const LIBELLES_ETAPES: Record<string, string> = { accueil: "Accueil", menu: "Menu", panier: "Panier", validation: "Validation" };
const LIBELLES_SYSTEMES: Record<string, string> = { android: "Android", ios: "iOS (iPhone, iPad)", windows: "Windows", macos: "Mac", linux: "Linux", autre: "Autre" };
const LIBELLES_APPAREILS: Record<string, string> = { telephone: "Téléphone", tablette: "Tablette", ordinateur: "Ordinateur" };
const LIBELLES_NAVIGATEURS: Record<string, string> = {
  chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet",
  instagram: "Instagram (intégré)", facebook: "Facebook (intégré)", tiktok: "TikTok (intégré)", autre: "Autre",
};

function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

function repartir(visites: { valeur: string; commande: boolean }[]): LigneRepartition[] {
  const m = new Map<string, LigneRepartition>();
  for (const v of visites) {
    const l = m.get(v.valeur) ?? { libelle: v.valeur, visites: 0, commandes: 0 };
    l.visites++;
    if (v.commande) l.commandes++;
    m.set(v.valeur, l);
  }
  return [...m.values()].sort((a, b) => b.visites - a.visites);
}

export async function chargerAudience(periode: PeriodeAudience): Promise<EtatAudience> {
  const supabase = createServiceSupabaseClient();
  const aujourdHui = dateMayotteIso();
  const depuis = periode === "aujourdhui" ? aujourdHui : ajouterJoursIso(aujourdHui, periode === "7j" ? -6 : -29);

  const [visites, clics, ajouts] = await Promise.all([
    toutLire((a, b) => supabase.from("visites_site").select("source, referent, appareil, systeme, navigateur, a_commande").gte("date_jour", depuis).range(a, b)),
    toutLire((a, b) => supabase.from("clics_site").select("visiteur, type, cible, duree_ms").gte("date_jour", depuis).range(a, b)),
    toutLire((a, b) => supabase.from("evenements_site").select("visiteur, produit").eq("type", "produit_ajoute").gte("date_jour", depuis).range(a, b)),
  ]);

  const provenance = repartir(visites.map((v) => ({ valeur: v.source ? `Lien étiqueté : ${v.source}` : v.referent ? `Site : ${v.referent}` : "Accès direct (ou lien sans étiquette)", commande: v.a_commande })));
  const systemes = repartir(visites.map((v) => ({ valeur: LIBELLES_SYSTEMES[v.systeme ?? "autre"] ?? "Autre", commande: v.a_commande })));
  const appareils = repartir(visites.map((v) => ({ valeur: LIBELLES_APPAREILS[v.appareil ?? "ordinateur"] ?? "Autre", commande: v.a_commande })));
  const navigateurs = repartir(visites.map((v) => ({ valeur: LIBELLES_NAVIGATEURS[v.navigateur ?? "autre"] ?? "Autre", commande: v.a_commande })));

  const parCible = new Map<string, { clics: number; visiteurs: Set<string> }>();
  for (const c of clics.filter((c) => c.type === "clic")) {
    const l = parCible.get(c.cible) ?? { clics: 0, visiteurs: new Set<string>() };
    l.clics++;
    l.visiteurs.add(c.visiteur);
    parCible.set(c.cible, l);
  }

  const vus = new Map<string, Set<string>>();
  for (const c of clics.filter((c) => c.type === "produit_vu")) (vus.get(c.cible) ?? vus.set(c.cible, new Set()).get(c.cible)!).add(c.visiteur);
  const ajoutes = new Map<string, Set<string>>();
  for (const a of ajouts) if (a.produit) (ajoutes.get(a.produit) ?? ajoutes.set(a.produit, new Set()).get(a.produit)!).add(a.visiteur);
  const tempsProduit = new Map<string, number[]>();
  for (const c of clics.filter((c) => c.type === "temps_produit" && c.duree_ms !== null)) (tempsProduit.get(c.cible) ?? tempsProduit.set(c.cible, []).get(c.cible)!).push(c.duree_ms as number);
  const produits = [...vus.entries()]
    .map(([produit, v]) => {
      const t = tempsProduit.get(produit);
      return { produit, vus: v.size, ajoutes: ajoutes.get(produit)?.size ?? 0, tempsMoyenSec: t?.length ? Math.round(t.reduce((s, x) => s + x, 0) / t.length / 1000) : null };
    })
    .sort((a, b) => b.vus - a.vus)
    .slice(0, 15);

  const tempsParEtape = new Map<string, number[]>();
  for (const c of clics.filter((c) => c.type === "temps_etape" && c.duree_ms !== null)) (tempsParEtape.get(c.cible) ?? tempsParEtape.set(c.cible, []).get(c.cible)!).push(c.duree_ms as number);
  const tempsEtapes = ORDRE_ETAPES.filter((e) => tempsParEtape.has(e)).map((e) => {
    const t = tempsParEtape.get(e)!;
    return { etape: LIBELLES_ETAPES[e] ?? e, tempsMoyenSec: Math.round(t.reduce((s, x) => s + x, 0) / t.length / 1000), tempsMedianSec: Math.round(mediane(t) / 1000), mesures: t.length };
  });

  return {
    periode,
    depuis,
    visites: visites.length,
    visitesAvecCommande: visites.filter((v) => v.a_commande).length,
    provenance,
    systemes,
    appareils,
    navigateurs,
    clics: [...parCible.entries()].map(([cible, l]) => ({ cible, clics: l.clics, visiteurs: l.visiteurs.size })).sort((a, b) => b.clics - a.clics).slice(0, 15),
    produits,
    tempsEtapes,
  };
}
