-- Suivi anonyme du site public (demande du patron, 2026-10-26) : voir en
-- direct qui est sur /commander et ou les clients abandonnent. Aucune donnee
-- personnelle : un identifiant aleatoire par onglet, jamais de nom, de
-- telephone, d'adresse ni d'IP.
create table if not exists visiteurs_site (
  visiteur uuid primary key,
  etape text not null,
  premiere_vue timestamptz not null default now(),
  derniere_activite timestamptz not null default now()
);
create index if not exists visiteurs_site_activite_idx on visiteurs_site (derniere_activite);

create table if not exists evenements_site (
  id bigint generated always as identity primary key,
  visiteur uuid not null,
  type text not null check (type in ('visite', 'mode_choisi', 'ajout_panier', 'produit_ajoute', 'commande_validee')),
  produit text not null default '',
  date_jour date not null,
  created_at timestamptz not null default now(),
  unique (visiteur, type, produit, date_jour)
);
create index if not exists evenements_site_jour_idx on evenements_site (date_jour, type);

alter table visiteurs_site enable row level security;
alter table evenements_site enable row level security;
