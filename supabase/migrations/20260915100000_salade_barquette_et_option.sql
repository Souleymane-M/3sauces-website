-- Salade incluse (choix obligatoire, gratuit) sur les barquettes, et salade
-- en option payante (1€) sur les tacos/tacos bowl. Champs par produit
-- (activables/désactivables individuellement depuis /patron), pas câblés
-- en dur par catégorie/nom dans le code.
alter table produits
  add column if not exists salade_incluse boolean not null default false,
  add column if not exists salade_prix_option numeric(10, 2);

update produits set salade_incluse = true
  where nom in ('Barquette + 1 canette', 'Grande Barquette + 1 canette');

update produits set salade_prix_option = 1.00
  where nom in (
    'Tacos 1 viande + 1 canette',
    'Tacos 2 viandes + 1 canette',
    'Tacos 3 viandes + 1 canette',
    'Tacos 4 viandes + 1 canette',
    'Tacos Bowl + 1 canette',
    'Grand Tacos Bowl + 1 canette'
  );

-- Produit dédié poussé comme ligne de panier séparée quand l'option
-- payante est cochée — même pattern que "Viande supplémentaire"/"Sauce
-- supplémentaire" (categorie: supplement), aucun calcul de prix ad hoc
-- nécessaire ailleurs.
insert into produits (nom, categorie, prix, description, actif, nb_viandes_max, nb_sauces_incluses, nb_saveurs_max, autorise_extras, canette_incluse, ordre)
select 'Salade supplémentaire', 'supplement', 1.00, null, true, 0, 0, 0, false, false,
  coalesce((select max(ordre) + 1 from produits where categorie = 'supplement'), 0)
where not exists (select 1 from produits where nom = 'Salade supplémentaire');
