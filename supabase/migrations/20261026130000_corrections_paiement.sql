-- Traçabilité des corrections de mode de paiement (espèces <-> carte) faites
-- par le patron après validation (demande du 2026-10-26, cf. commande #605).
create table if not exists corrections_paiement (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes (id),
  ancien_mode text not null,
  nouveau_mode text not null,
  profil_id uuid not null references profils (id),
  created_at timestamptz not null default now()
);

create index if not exists corrections_paiement_commande_idx on corrections_paiement (commande_id);

alter table corrections_paiement enable row level security;
