-- Base client unifiée (caisse + site + livreur terrain) — Module 5.
-- Clé primaire = numéro de téléphone (normalisé E.164, ex: +33612345678),
-- conformément au brief.

create table if not exists clients (
  telephone text primary key,

  -- Cycle de fidélité en cours (remis à zéro après récompense utilisée ou expiration).
  montant_cumule numeric(10, 2) not null default 0 check (montant_cumule >= 0),
  tampons_acquis integer generated always as (floor(montant_cumule / 10)::int) stored,
  recompense_disponible boolean not null default false,

  date_premier_achat_cycle timestamptz,
  date_expiration timestamptz,

  -- Conformité RGPD / consentement SMS marketing.
  sms_optin boolean not null default false,
  date_optin timestamptz,
  sms_stop_at timestamptz, -- renseigné si le client répond STOP

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

comment on table clients is
  'Table client partagée caisse + site + livreur. 1 tampon = 10€ cumulés. '
  'Récompense à 10 tampons (100€) = 10€ offerts, valable 3 mois, non fractionnable.';

comment on column clients.tampons_acquis is
  'Calculé automatiquement = floor(montant_cumule / 10). Ne pas écrire directement.';

-- Journal des mouvements de fidélité : accumulation, récompense utilisée, expiration.
-- Sert d'historique/audit et de source pour les notifications SMS (Module 5).
create table if not exists fidelite_mouvements (
  id uuid primary key default gen_random_uuid(),
  client_telephone text not null references clients (telephone) on delete cascade,
  type text not null check (type in ('accumulation', 'recompense_disponible', 'recompense_utilisee', 'expiration')),
  montant numeric(10, 2), -- montant de la commande à l'origine de l'accumulation, si applicable
  commande_id uuid references commandes (id),
  created_at timestamptz not null default now()
);

create index if not exists fidelite_mouvements_client_idx
  on fidelite_mouvements (client_telephone, created_at desc);

alter table clients enable row level security;
alter table fidelite_mouvements enable row level security;
