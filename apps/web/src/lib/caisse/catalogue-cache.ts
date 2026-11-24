import "server-only";
import { unstable_cache } from "next/cache";
import { listerProduitsActifs, listerViandesActives, listerSaucesActives, listerSaveursActives, listerParfums2lActifs } from "@/lib/caisse/produits";
import { chargerParametresLivraisonPublics } from "@/lib/commande-publique/parametres";

/**
 * Catalogue de la caisse gardé 30 secondes en mémoire côté serveur : produits, viandes, sauces, saveurs, parfums et
 * paramètres changent rarement, et les relire à chaque ouverture de /caisse (6 requêtes) ralentissait l'écran.
 * Un changement fait par le patron apparaît donc en caisse au plus 30 secondes plus tard.
 */
const OPTIONS = { revalidate: 30 } as const;
export const produitsCaisse = unstable_cache(listerProduitsActifs, ["caisse-produits"], OPTIONS);
export const viandesCaisse = unstable_cache(listerViandesActives, ["caisse-viandes"], OPTIONS);
export const saucesCaisse = unstable_cache(listerSaucesActives, ["caisse-sauces"], OPTIONS);
export const saveursCaisse = unstable_cache(listerSaveursActives, ["caisse-saveurs"], OPTIONS);
export const parfums2lCaisse = unstable_cache(listerParfums2lActifs, ["caisse-parfums2l"], OPTIONS);
export const parametresCaisse = unstable_cache(chargerParametresLivraisonPublics, ["caisse-parametres"], OPTIONS);
