-- Module 2 — Livraison & traçabilité QR code.

create table if not exists livraisons (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes (id),
  livreur_id uuid references profils (id), -- assigné au flash 1 (ou en amont)

  qr_code text not null unique default encode(gen_random_bytes(16), 'hex'),

  heure_commande timestamptz not null default now(),
  heure_souhaitee timestamptz,

  -- FLASH 1 : scan QR au départ cuisine.
  heure_depart_cuisine timestamptz,

  -- FLASH 2 : scan QR à la livraison chez le client.
  heure_livraison_effective timestamptz,

  statut text not null default 'en_attente' check (
    statut in ('en_attente', 'en_livraison', 'livre')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger livraisons_set_updated_at
  before update on livraisons
  for each row
  execute function set_updated_at();

create index if not exists livraisons_livreur_statut_idx on livraisons (livreur_id, statut);
create unique index if not exists livraisons_qr_code_idx on livraisons (qr_code);

comment on table livraisons is
  'Traçabilité complète : QR généré à la validation commande, flashé au départ '
  'cuisine (flash 1) puis à la livraison (flash 2). Alimente le dashboard patron '
  '(temps réel par livreur, écart vs heure souhaitée, cuisine vs trajet).';

alter table livraisons enable row level security;
