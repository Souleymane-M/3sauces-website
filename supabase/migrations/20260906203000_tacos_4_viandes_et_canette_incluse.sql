-- La contrainte d'origine limitait nb_viandes_max a 3 (max historique avant
-- Tacos 4 viandes). On l'elargit a 4 pour accueillir le nouveau produit.
alter table produits drop constraint produits_nb_viandes_max_check;
alter table produits add constraint produits_nb_viandes_max_check check (nb_viandes_max between 0 and 4);

-- Nouveau produit : Tacos 4 viandes, meme regle que Tacos 3 viandes
-- (jusqu'a 3 sauces incluses, extras illimites, canette incluse).
insert into produits (nom, categorie, prix, nb_viandes_max, nb_sauces_incluses, autorise_extras, canette_incluse)
values ('Tacos 4 viandes + 1 canette', 'snacking', 17.50, 4, 3, true, true)
on conflict (nom) do nothing;

-- Precise "+ 1 canette" dans le nom affiche des Tacos/Barquette/Tacos Bowl
-- (canette deja incluse dans le prix, jusqu'ici non indique sur la carte).
-- Ne concerne ni les grillades (pas de canette incluse) ni les menus
-- speciaux (deja precise dans leur description existante).
update produits set nom = 'Tacos 1 viande + 1 canette' where nom = 'Tacos 1 viande';
update produits set nom = 'Tacos 2 viandes + 1 canette' where nom = 'Tacos 2 viandes';
update produits set nom = 'Tacos 3 viandes + 1 canette' where nom = 'Tacos 3 viandes';
update produits set nom = 'Barquette + 1 canette' where nom = 'Barquette';
update produits set nom = 'Grande Barquette + 1 canette' where nom = 'Grande Barquette';
update produits set nom = 'Tacos Bowl + 1 canette' where nom = 'Tacos Bowl';
update produits set nom = 'Grand Tacos Bowl + 1 canette' where nom = 'Grand Tacos Bowl';
