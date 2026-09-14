import type { Categorie } from "@3sauces/supabase";

/**
 * Seuil à partir duquel une commande livraison devient prioritaire
 * (badge "PRIORITAIRE 🚀" en cuisine/livreur, mise en avant côté client).
 * Volontairement pas de colonne "prioritaire" en base : toujours dérivé
 * à la volée de `nb_plats` pour ne jamais avoir à migrer si ce seuil
 * change un jour.
 */
export const SEUIL_COMMANDE_PRIORITAIRE = 3;

const CATEGORIES_PLAT_PRINCIPAL = new Set<Categorie>(["menu_special", "plat_du_jour", "snacking"]);

export interface LigneAvecCategorie {
  categorie: Categorie;
  quantite: number;
}

/**
 * Annote chaque ligne avec son numéro de "plat" (null si elle ne compte
 * pas dans le seuil). Une grillade ne compte que si elle est appariée
 * 1-pour-1 avec un accompagnement disponible ailleurs dans les mêmes
 * lignes (les accompagnements/grillades "en trop" ne comptent pas).
 * Utilisée aussi bien côté client (aperçu panier, en direct) que côté
 * serveur (calcul autoritatif à l'enregistrement) — jamais de confiance
 * dans un total envoyé par le client, toujours recalculé ici à partir de
 * lignes déjà validées.
 */
export function annoterPlatsPrincipaux<T extends LigneAvecCategorie>(
  lignes: T[]
): { nbPlats: number; lignes: (T & { numeroPlat: number | null })[] } {
  // `numeroCarte` numérote les cartes affichées (Plat 1, Plat 2...), une
  // par ligne qualifiée quelle que soit sa quantité. `nbPlats` (le seuil
  // des 3 plats) pondère par la quantité : 3x le même tacos sur une seule
  // ligne, c'est bien 3 vrais plats à préparer et à livrer.
  let numeroCarte = 0;
  let nbPlats = 0;
  let accompagnementsRestants = lignes
    .filter((l) => l.categorie === "accompagnement")
    .reduce((s, l) => s + l.quantite, 0);

  const annotees = lignes.map((l) => {
    if (CATEGORIES_PLAT_PRINCIPAL.has(l.categorie)) {
      numeroCarte += 1;
      nbPlats += l.quantite;
      return { ...l, numeroPlat: numeroCarte };
    }
    if (l.categorie === "grillade" && accompagnementsRestants >= l.quantite) {
      accompagnementsRestants -= l.quantite;
      numeroCarte += 1;
      nbPlats += l.quantite;
      return { ...l, numeroPlat: numeroCarte };
    }
    return { ...l, numeroPlat: null };
  });

  return { nbPlats, lignes: annotees };
}
