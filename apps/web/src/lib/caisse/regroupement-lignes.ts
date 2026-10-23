import type { Categorie } from "@3sauces/supabase";

/**
 * Ordre d'affichage des catégories sur un ticket/écran de préparation —
 * du plus "composé" (menus, plats du jour, formules) au plus simple
 * (grillades, accompagnements, boissons, suppléments). Toujours le même
 * ordre partout (cuisine, livreur, ticket imprimé) pour que l'équipe s'y
 * retrouve sans avoir à rapprendre une mise en page différente à chaque
 * écran.
 */
const ORDRE_CATEGORIES: Categorie[] = [
  "petit_dejeuner",
  "menu_special",
  "plat_du_jour",
  "snacking",
  "grillade",
  "accompagnement",
  "boisson",
  "supplement",
];

export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  petit_dejeuner: "Petit déjeuner",
  menu_special: "Menus",
  plat_du_jour: "Plats du jour",
  snacking: "Snack",
  grillade: "Grillades",
  accompagnement: "Accompagnements",
  boisson: "Boissons",
  supplement: "Suppléments",
};

/**
 * Repère grossier de "famille" de produit (tacos / tacos bowl /
 * barquette...) pour que les variantes d'un même type restent groupées
 * sur le ticket (ex: les 4 tailles de Tacos ensemble, Grande Barquette
 * avec Barquette) quel que soit l'ordre d'ajout au panier — demande
 * explicite du patron, 2026-10-23 : un simple tri alphabétique par nom
 * sépare "Barquette" de "Grande Barquette" (la lettre G s'intercale), ce
 * mot-clé l'évite. Concerne en pratique la catégorie "snacking"
 * (modificateurs "Grand"/"Grande" devant le nom), mais sans danger
 * ailleurs : un produit qui ne correspond à aucun mot-clé reste
 * simplement sa propre famille (le nom lui-même).
 */
function familleProduit(nom: string): string {
  const n = nom.toLowerCase();
  if (n.includes("tacos bowl")) return "tacos bowl";
  if (n.includes("tacos")) return "tacos";
  if (n.includes("barquette")) return "barquette";
  return n;
}

export interface GroupeLignes<L extends { categorie: Categorie }> {
  categorie: Categorie;
  titre: string;
  lignes: L[];
}

/**
 * Regroupe les lignes d'une commande par catégorie (grillades ensemble,
 * accompagnements ensemble, etc.) au lieu de l'ordre d'ajout au panier —
 * sans ça, un accompagnement ajouté en dernier (ex: Manioc) se retrouve
 * loin des autres et passe inaperçu en cuisine. Ne touche jamais au détail
 * d'une ligne elle-même (viande/sauce/boisson incluse restent affichés
 * directement sous leur ligne, jamais éclatés).
 */
export function regrouperLignesParCategorie<L extends { categorie: Categorie; nom: string }>(lignes: L[]): GroupeLignes<L>[] {
  return ORDRE_CATEGORIES.map((categorie) => ({
    categorie,
    titre: LIBELLE_CATEGORIE[categorie],
    lignes: lignes
      .filter((l) => l.categorie === categorie)
      .sort((a, b) => familleProduit(a.nom).localeCompare(familleProduit(b.nom))),
  })).filter((groupe) => groupe.lignes.length > 0);
}
