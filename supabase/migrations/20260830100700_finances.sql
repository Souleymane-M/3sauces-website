-- Module 6 — Finances (accès patron uniquement).

create table if not exists charges_fixes (
  id uuid primary key default gen_random_uuid(),
  nom text not null, -- salaires, leasing, eau, électricité, loyer...
  montant numeric(10, 2) not null check (montant >= 0),
  frequence text not null default 'mensuelle' check (frequence in ('mensuelle', 'annuelle', 'ponctuelle')),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger charges_fixes_set_updated_at
  before update on charges_fixes
  for each row
  execute function set_updated_at();

comment on table charges_fixes is
  'Charges fixes saisies et modifiables uniquement par le patron.';

-- Paramètres globaux clé/valeur (seuils dashboard, etc.), modifiables patron uniquement.
create table if not exists parametres (
  cle text primary key,
  valeur jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger parametres_set_updated_at
  before update on parametres
  for each row
  execute function set_updated_at();

insert into parametres (cle, valeur, description) values
  ('seuil_ca_jour', '291', 'Seuil de CA journalier affiché sur le dashboard patron (barre de progression)'),
  ('objectif_ca_jour', '1000', 'Objectif de CA journalier après le seuil')
on conflict (cle) do nothing;

alter table charges_fixes enable row level security;
alter table parametres enable row level security;
