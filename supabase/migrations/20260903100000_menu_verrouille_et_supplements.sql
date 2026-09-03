-- Corrections urgentes /commander (retour utilisateur du 2026-09-03, après
-- mise en prod des sauces) :
--
-- 1. Menu Collégien : produit "verrouillé" — viande fixe (Poulet), pas de
--    configurateur. On modélise ça avec une colonne générique `viande_imposee`
--    (plutôt qu'un cas particulier codé en dur) : si renseignée, le site
--    public ajoute le produit directement au panier avec cette viande, sans
--    ouvrir la modale, et le serveur refuse toute autre viande envoyée pour
--    ce produit.
--
-- 2. Viande/sauce supplémentaire optionnelles dans le configurateur
--    Tacos/Barquette/Bowl : réutilise le produit existant "Viande
--    supplémentaire" (on lui donne un nb_viandes_max=1 pour permettre de
--    choisir laquelle) et crée "Sauce supplémentaire" (+0,50€, une seule
--    sauce par ligne). Les deux restent des produits normaux, juste retirés
--    de la grille principale côté application (catégorie 'supplement').

alter table produits
  add column if not exists viande_imposee text;

comment on column produits.viande_imposee is
  'Si renseigné, ce produit est ajouté au panier public directement avec cette viande unique, sans configurateur (ex: Menu Collégien = Poulet).';

update produits set viande_imposee = 'Poulet'
  where nom = 'Menu Collégien';

-- La viande supplémentaire nécessite désormais de choisir laquelle (le
-- configurateur affiche le même sélecteur que pour les viandes incluses).
-- Grammage aligné sur un slot "1 viande" standard.
update produits set nb_viandes_max = 1, grammage_kebab_g = 110
  where nom = 'Viande supplémentaire';

insert into produits (nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, grammage_kebab_g, est_desactivable) values
  ('Sauce supplémentaire', 'supplement', 0.50, null, false, 0, null, false)
on conflict (nom) do nothing;
