-- Ajoute une description libre aux produits, affichée sur la page publique
-- /commander (ex: composition d'un menu, accompagnements inclus). Optionnelle
-- (NULL si pas encore renseignée) pour ne pas casser les produits existants.
alter table produits
  add column if not exists description text;

comment on column produits.description is
  'Description courte affichée au client sur /commander (ex: composition du menu). NULL = rien affiché.';

update produits set description = 'Mini Tacos poulet + Jus de paille'
  where nom = 'Menu Collégien';

update produits set description = 'Mini Tacos 1 viande + Frites + Canette'
  where nom = 'Menu Étudiant';

update produits set description = '+ accompagnement + salade + canette ou eau'
  where nom = 'Poisson grillé';
