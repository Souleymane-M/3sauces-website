-- Nouvelle categorie "accompagnement" : section publique juste apres
-- Grillades. Produits a prix fixe, ajout direct au panier (pas de
-- configurateur), meme regime que les grillades. Certains ne seront pas
-- disponibles tous les jours (desactivation au cas par cas via `actif`,
-- a faire manuellement pour l'instant en attendant le back-office patron).
alter table produits drop constraint produits_categorie_check;
alter table produits add constraint produits_categorie_check
  check (categorie in ('menu_special', 'snacking', 'grillade', 'cuisine_locale', 'boisson', 'supplement', 'accompagnement'));

insert into produits (nom, categorie, prix) values
  ('Bananes x3', 'accompagnement', 2.00),
  ('Manioc x3', 'accompagnement', 2.00),
  ('Jimbi (Songe) x3', 'accompagnement', 2.00),
  ('Frites', 'accompagnement', 2.00),
  ('Salade', 'accompagnement', 3.00),
  ('Riz blanc', 'accompagnement', 3.00),
  ('Riz jaune', 'accompagnement', 4.00)
on conflict (nom) do nothing;
