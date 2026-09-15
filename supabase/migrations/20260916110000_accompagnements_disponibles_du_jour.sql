-- Disponibilité du jour des accompagnements sur les Plats du jour : jusqu'ici
-- le configurateur proposait systématiquement les 6 accompagnements, sans
-- notion de "ce qui est réellement préparé aujourd'hui". Champ par produit
-- (configurable depuis /patron), même pattern que accompagnement_inclus.
alter table produits
  add column if not exists accompagnements_disponibles text[] not null default '{}';

-- Backfill avec les accompagnements actuellement actifs, pour ne rien casser
-- au déploiement — le patron affinera ensuite au jour le jour.
update produits
  set accompagnements_disponibles = array['Frites', 'Jimbi (Songe) x3', 'Manioc x3', 'Riz blanc']
  where accompagnement_inclus = true;
