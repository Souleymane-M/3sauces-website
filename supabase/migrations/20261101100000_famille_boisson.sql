-- Familles de boissons bien distinctes (demande du patron, 2026-11-01) :
-- canettes 33cl, boissons 2L, boissons 50cl, eau. Avant, le site les
-- separait en devinant d'apres la position du produit dans la liste.
alter table produits
  add column if not exists famille_boisson text
  check (famille_boisson in ('canette', 'boisson_2l', 'boisson_50cl', 'eau'));

update produits set famille_boisson = 'canette'
  where categorie = 'boisson' and nom in ('Canette 33cl', 'Stony Ginger (gingembre)');
update produits set famille_boisson = 'boisson_2l'
  where categorie = 'boisson' and nom = 'Boisson 2L';
update produits set famille_boisson = 'boisson_50cl'
  where categorie = 'boisson' and nom in ('Coca 50cl', 'Perrier 50cl');
update produits set famille_boisson = 'eau'
  where categorie = 'boisson' and nom in ('Eau 50cl', 'Eau 1,5L');
