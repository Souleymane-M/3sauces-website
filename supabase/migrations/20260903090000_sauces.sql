-- Référentiel des sauces sélectionnables sur les produits snacking (Tacos,
-- Barquette, Tacos Bowl) : jusqu'à 3 sauces incluses, sans supplément
-- (règle métier appliquée côté application, pas en base). RLS activé
-- directement (cohérent avec la migration 20260902070000) : seule la
-- clé service_role (routes API serveur) accède à cette table.
create table if not exists sauces (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into sauces (nom) values
  ('Mayo'),
  ('Ketchup'),
  ('Piment'),
  ('Samouraï'),
  ('Algérienne'),
  ('BBQ'),
  ('Blanche'),
  ('Sauce salade'),
  ('Fromagère')
on conflict (nom) do nothing;

alter table sauces enable row level security;
