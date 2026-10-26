-- Commandes mises en attente en caisse, partagees entre tous les appareils
-- (demande du patron, 2026-10-26) : avant, elles ne vivaient que dans le
-- navigateur de l'appareil qui les avait mises de cote.
create table if not exists commandes_en_attente_caisse (
  id uuid primary key,
  contenu jsonb not null,
  cree_par uuid references profils (id),
  created_at timestamptz not null default now()
);

create index if not exists commandes_en_attente_caisse_created_idx
  on commandes_en_attente_caisse (created_at);

alter table commandes_en_attente_caisse enable row level security;
