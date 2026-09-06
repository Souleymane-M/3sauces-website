-- Référentiel des saveurs de canette 33cl (site public uniquement) : choix
-- exactement 1 saveur avant ajout au panier, même mécanisme générique que
-- `nb_viandes_max` pour les viandes. RLS activé directement (cohérent avec
-- 20260903090000_sauces.sql) : seule la clé service_role (routes API
-- serveur) accède à cette table.
create table if not exists saveurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into saveurs (nom) values
  ('Coca'),
  ('Orangina'),
  ('Schweppes agrumes'),
  ('Schweppes tonic'),
  ('Oasis tropical'),
  ('Oasis thé pêche'),
  ('Oasis pomme-framboise-cassis')
on conflict (nom) do nothing;

alter table saveurs enable row level security;

alter table produits
  add column if not exists nb_saveurs_max integer not null default 0;

comment on column produits.nb_saveurs_max is
  'Nombre de saveurs a choisir avant ajout au panier (site public) : 0 = ajout direct, 1 = choix obligatoire d une saveur parmi `saveurs`.';

-- "Canette seule" devient "Canette 33cl" avec choix de saveur obligatoire.
update produits set nom = 'Canette 33cl', nb_saveurs_max = 1
  where nom = 'Canette seule';

-- Perrier reste un produit à part (50cl, prix différent), pas une saveur de
-- la canette 33cl.
insert into produits (nom, categorie, prix, nb_saveurs_max)
values ('Perrier 50cl', 'boisson', 2.5, 0)
on conflict (nom) do nothing;
