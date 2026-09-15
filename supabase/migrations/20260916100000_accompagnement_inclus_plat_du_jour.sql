-- Choix d'accompagnement gratuit inclus (Plats du jour) : jusqu'ici, cliquer
-- sur un Plat du jour n'ouvrait qu'un sélecteur de quantité, sans jamais
-- proposer l'accompagnement ni la boisson pourtant annoncés dans la
-- description ("+ accompagnement + salade" / "+ salade"). Champ par produit
-- (activable/désactivable individuellement depuis /patron), même pattern
-- que salade_incluse/canette_incluse — jamais câblé en dur par catégorie.
--
-- La salade, elle, reste incluse automatiquement sans aucun choix quand
-- elle fait partie de la recette (un seul type de salade disponible) : pas
-- besoin de champ dédié, contrairement à `salade_incluse` qui, lui, force
-- un choix "garder/retirer" (mécanisme différent, utilisé sur les
-- barquettes).
alter table produits
  add column if not exists accompagnement_inclus boolean not null default false;

update produits set accompagnement_inclus = true
  where nom in ('Poulpe grillé', 'Poisson grillé');

-- Corrige au passage `canette_incluse`, incohérent avec la description
-- actuelle de ces deux plats : "Poulpe grillé" annonce "+ 1 canette" mais
-- n'avait pas le flag ; "Poisson grillé" avait le flag (reliquat d'une
-- description antérieure mentionnant une canette) alors que sa description
-- actuelle ne mentionne plus que l'accompagnement et la salade.
update produits set canette_incluse = true where nom = 'Poulpe grillé';
update produits set canette_incluse = false where nom = 'Poisson grillé';
