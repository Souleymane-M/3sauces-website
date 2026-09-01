-- Ajout au brief (2026-08-30) — Paramètres livraison, oubliés dans la V1.
-- Tout est modifiable par le patron en temps réel, sans intervention technique.

-- Paramètres livraison : table singleton (une seule ligne, id=true forcé).
create table if not exists parametres_livraison (
  id boolean primary key default true check (id),
  heure_debut time not null default '11:00',
  heure_fin time not null default '14:00',
  minimum_commande numeric(10, 2) not null default 8.00 check (minimum_commande >= 0),
  updated_at timestamptz not null default now()
);

create trigger parametres_livraison_set_updated_at
  before update on parametres_livraison
  for each row
  execute function set_updated_at();

insert into parametres_livraison (id) values (true)
on conflict (id) do nothing;

comment on table parametres_livraison is
  'Ligne unique de paramètres livraison : horaires (défaut 11h-14h) et minimum '
  'de commande (défaut 8€). Modifiable par le patron depuis le dashboard.';

-- Zones de livraison autorisées. Une seule commune au lancement (Dembéni),
-- mais table pensée pour en ajouter d'autres plus tard sans changement de schéma.
create table if not exists zones_livraison (
  id uuid primary key default gen_random_uuid(),
  commune text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into zones_livraison (commune) values ('Dembéni')
on conflict (commune) do nothing;

comment on table zones_livraison is
  'Communes où la livraison est autorisée. commandes.zone_livraison (colonne '
  'existante, texte libre) doit être validée côté application contre cette liste.';

alter table parametres_livraison enable row level security;
alter table zones_livraison enable row level security;
