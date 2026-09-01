-- Module 3 — Stocks & lots.

create table if not exists fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  contact text,
  created_at timestamptz not null default now()
);

-- Articles de stock = matières premières achetées (distinct des "produits" vendus).
-- Un produit vendu (ex: Tacos 1 viande) consomme un ou plusieurs articles de stock
-- (ex: Kebab en grammes + riz/frites/crudités en portion standard).
create table if not exists articles_stock (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  unite_achat text not null check (unite_achat in ('kg', 'pieces', 'cartons', 'litres')),
  unite_deduction text not null check (unite_deduction in ('grammes', 'pieces', 'portions_3', 'portion_standard')),
  portion_standard numeric(10, 2), -- ex: grammage par portion standard riz/frites/crudités
  created_at timestamptz not null default now()
);

insert into articles_stock (nom, unite_achat, unite_deduction, portion_standard) values
  ('Kebab (broche)', 'kg', 'grammes', null),
  ('Poulet', 'kg', 'pieces', null),
  ('Merguez', 'pieces', 'pieces', null),
  ('Steak', 'pieces', 'pieces', null),
  ('Cordon bleu', 'pieces', 'pieces', null),
  ('Croupion', 'pieces', 'portions_3', null),
  ('Brochettes bœuf', 'pieces', 'portions_3', null),
  ('Ailes', 'pieces', 'portions_3', null),
  ('Cuisse poulet', 'pieces', 'pieces', null),
  ('Riz', 'kg', 'portion_standard', 150),
  ('Frites', 'kg', 'portion_standard', 150),
  ('Crudités', 'kg', 'portion_standard', 80),
  ('Canette', 'cartons', 'pieces', null),
  ('Poisson', 'kg', 'pieces', null),
  ('Poulpe', 'kg', 'portion_standard', 200)
on conflict (nom) do nothing;

comment on table articles_stock is
  'Matières premières achetées. Portions/grammages ajustables par le patron.';

-- Un lot = un achat fournisseur. Un seul lot "actif" à la fois par article_stock.
create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  article_stock_id uuid not null references articles_stock (id),
  fournisseur_id uuid references fournisseurs (id),

  quantite_achetee numeric(10, 2) not null check (quantite_achetee > 0),
  unite text not null,
  prix_paye numeric(10, 2) not null check (prix_paye >= 0),

  date_achat date not null default current_date,
  statut text not null default 'actif' check (statut in ('actif', 'epuise')),

  date_ouverture timestamptz not null default now(),
  date_cloture timestamptz,

  facture_id uuid, -- FK logique vers factures(id), voir migration factures_ocr

  created_at timestamptz not null default now()
);

-- Un seul lot actif par article de stock à la fois.
create unique index if not exists lots_un_seul_actif_par_article
  on lots (article_stock_id)
  where statut = 'actif';

create index if not exists lots_article_statut_idx on lots (article_stock_id, statut);

comment on table lots is
  'Un lot = un achat fournisseur pour un article de stock. '
  'Devient actif à la création, épuisé quand entièrement déduit (voir lot_mouvements).';

-- Chaque déduction de stock (servie sur une commande) est tracée ici,
-- ce qui permet de calculer CA/marge/portions/durée d'écoulement par lot (archive).
create table if not exists lot_mouvements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots (id),
  commande_id uuid references commandes (id),
  quantite_deduite numeric(10, 2) not null check (quantite_deduite > 0),
  created_at timestamptz not null default now()
);

create index if not exists lot_mouvements_lot_idx on lot_mouvements (lot_id, created_at);

alter table fournisseurs enable row level security;
alter table articles_stock enable row level security;
alter table lots enable row level security;
alter table lot_mouvements enable row level security;
