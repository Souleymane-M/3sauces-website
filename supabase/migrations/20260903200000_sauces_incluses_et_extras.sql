-- Corrections urgentes /commander (retour utilisateur du 2026-09-03, deuxieme
-- vague) :
--
-- La regle "combien de sauces incluses / extras autorises" ne peut plus etre
-- deduite d'une simple liste de categories (CATEGORIES_AVEC_SAUCES) car les
-- deux produits `menu_special` (Menu Collegien, Menu Etudiant) ont desormais
-- des regles differentes entre eux :
--   - Menu Collegien : jusqu'a 2 sauces incluses, PAS d'extras (viande fixe
--     Poulet, pas de viande/sauce supplementaire).
--   - Menu Etudiant : jusqu'a 3 sauces incluses, extras illimites (viande et
--     sauce supplementaires, sans limite de quantite).
--   - Tacos / Barquette / Bowl (categorie `snacking`) : jusqu'a 3 sauces
--     incluses, extras illimites (deja le comportement existant).
--
-- On modelise donc ça avec deux colonnes generiques sur `produits`, dans le
-- meme esprit que `viande_imposee` : la regle metier vit en base, pas
-- codee en dur par nom de produit dans l'application.

alter table produits
  add column if not exists nb_sauces_incluses integer not null default 0,
  add column if not exists autorise_extras boolean not null default false;

comment on column produits.nb_sauces_incluses is
  'Nombre maximum de sauces incluses sans supplement dans le configurateur public (0 = pas de sauces proposees).';
comment on column produits.autorise_extras is
  'Si vrai, le configurateur public propose des ajouts payants illimites (viande supplementaire +3E/unite, sauce supplementaire +0,50E/unite).';

update produits set nb_sauces_incluses = 2, autorise_extras = false
  where nom = 'Menu Collégien';

update produits set nb_sauces_incluses = 3, autorise_extras = true
  where nom = 'Menu Étudiant';

update produits set nb_sauces_incluses = 3, autorise_extras = true
  where categorie = 'snacking';
