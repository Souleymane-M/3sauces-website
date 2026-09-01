-- Module 4 — Import factures fournisseur (OCR via API Anthropic).

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid references fournisseurs (id),
  fournisseur_nom_brut text, -- nom tel que lu par l'OCR avant rapprochement éventuel
  date_facturation date,

  fichier_url text, -- chemin dans Supabase Storage (photo/scan original)
  fichier_type text check (fichier_type in ('jpg', 'png', 'pdf')),

  statut text not null default 'en_attente_validation' check (
    statut in ('en_attente_validation', 'validee', 'rejetee')
  ),

  valide_par uuid references profils (id),
  valide_at timestamptz,

  created_at timestamptz not null default now()
);

create table if not exists facture_lignes (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures (id) on delete cascade,

  description text not null, -- texte brut extrait par l'OCR
  quantite numeric(10, 2),
  unite text,
  prix_unitaire numeric(10, 2),
  montant numeric(10, 2),

  -- Rapprochement effectué à la validation patron : quel article de stock,
  -- et quel lot a été créé à partir de cette ligne.
  article_stock_id uuid references articles_stock (id),
  lot_id uuid references lots (id),

  created_at timestamptz not null default now()
);

create index if not exists facture_lignes_facture_idx on facture_lignes (facture_id);

comment on table factures is
  'En-tête facture importée (photo ou fichier). Extraction OCR automatique, '
  'validation manuelle du patron avant création des lots (Module 4).';

comment on table facture_lignes is
  'Lignes extraites par OCR. Validées/corrigées par le patron avant de générer les lots.';

-- Maintenant que `factures` existe, on peut poser la contrainte FK sur lots.facture_id.
alter table lots
  add constraint lots_facture_id_fkey
  foreign key (facture_id) references factures (id);

alter table factures enable row level security;
alter table facture_lignes enable row level security;
