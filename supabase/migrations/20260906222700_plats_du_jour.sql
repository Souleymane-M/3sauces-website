-- Nouvelle categorie "plat_du_jour" : section publique juste apres Menus
-- speciaux. Contrairement a l'ancien produit unique "Plat du jour" (prix
-- libre, saisi par le client en caisse), ce sont des produits normaux a
-- prix fixe defini par le patron via /patron, plusieurs actifs en meme
-- temps. Aucune donnee inseree ici : a ajouter depuis la nouvelle
-- interface /patron une fois deployee.
alter table produits drop constraint produits_categorie_check;
alter table produits add constraint produits_categorie_check
  check (categorie in ('menu_special', 'snacking', 'grillade', 'cuisine_locale', 'boisson', 'supplement', 'accompagnement', 'plat_du_jour'));
