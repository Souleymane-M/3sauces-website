-- Corrections de données : "Menu Collégien" était mal classé (cuisine_locale
-- au lieu de menu_special), l'ancien produit "Plat du jour" à prix libre est
-- obsolète depuis la catégorie plat_du_jour, et kangué/Poisson grillé/Poulpe
-- grillé sont en réalité des plats du jour (recette qui change, prix fixé
-- par le patron) plutôt que des grillades fixes.
update produits set categorie = 'menu_special' where nom = 'Menu Collégien';
delete from produits where nom = 'Plat du jour' and categorie = 'cuisine_locale' and prix is null;
update produits set categorie = 'plat_du_jour' where nom in ('kangué', 'Poisson grillé', 'Poulpe grillé');
update produits set nom = 'Kangué' where nom = 'kangué';

insert into produits (nom, categorie, prix, description, actif, nb_viandes_max, nb_sauces_incluses, nb_saveurs_max, autorise_extras, canette_incluse)
values ('Poulpe à la sauce tomate', 'plat_du_jour', 15, null, true, 0, 0, 0, false, false);

-- "Cuisine locale" retirée : plus aucun produit ne l'utilise après les
-- corrections ci-dessus.
alter table produits drop constraint produits_categorie_check;
alter table produits add constraint produits_categorie_check
  check (categorie in ('menu_special', 'snacking', 'grillade', 'boisson', 'supplement', 'accompagnement', 'plat_du_jour'));

-- Ordre d'affichage configurable (remplace le tri alphabétique fixe côté
-- /patron et le hack ORDRE_MENUS_SPECIAUX codé en dur côté site public).
-- Backfill déterministe : ordre marketing repris explicitement pour Menus
-- spéciaux et Plats du jour, alphabétique ailleurs — rien ne bouge
-- visuellement tant que le patron ne réordonne pas lui-même.
alter table produits add column if not exists ordre integer;

with numerotation as (
  select id,
    row_number() over (
      partition by categorie
      order by
        case
          when categorie = 'menu_special' and nom = 'Menu Étudiant' then 0
          when categorie = 'menu_special' and nom = 'Menu Collégien' then 1
          when categorie = 'plat_du_jour' and nom = 'Kangué' then 0
          when categorie = 'plat_du_jour' and nom = 'Poisson grillé' then 1
          when categorie = 'plat_du_jour' and nom = 'Poulpe à la sauce tomate' then 2
          when categorie = 'plat_du_jour' and nom = 'Poulpe grillé' then 3
          else 99
        end,
        nom
    ) - 1 as position
  from produits
)
update produits set ordre = numerotation.position
from numerotation where produits.id = numerotation.id;

alter table produits alter column ordre set not null;
alter table produits alter column ordre set default 0;
