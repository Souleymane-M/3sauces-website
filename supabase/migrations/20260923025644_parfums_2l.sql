-- Référentiel indépendant de `saveurs` (canettes) pour les parfums de
-- la Boisson 2L — gérable séparément depuis /patron (le patron ne
-- peut pas gérer les deux ensemble s'ils partagent la même liste).
-- RLS activé directement (cohérent avec 20260906120000_saveurs_boissons.sql) :
-- seule la clé service_role (routes API serveur) accède à cette table.
create table if not exists parfums_2l (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into parfums_2l (nom) values
  ('Coca'), ('Orangina'), ('Schweppes agrumes'), ('Schweppes tonic'),
  ('Oasis tropical'), ('Oasis thé pêche'), ('Oasis pomme-framboise-cassis'),
  ('Eau'), ('Perrier')
on conflict (nom) do nothing;

alter table parfums_2l enable row level security;
