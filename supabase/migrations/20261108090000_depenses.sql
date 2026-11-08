-- Dépenses de 3 Sauces : achats, charges, coûts (demande du patron, 2026-11-08).
-- Chaque dépense peut avoir sa facture en photo (stockée dans le bucket privé « factures »)
-- et le détail de ses lignes (lu par l'IA puis corrigé par le patron), utile pour calculer le coût réel des plats.
-- Table lue/écrite uniquement par le serveur (service role) : RLS activé, aucune politique publique.
create table if not exists depenses (
  id uuid primary key default gen_random_uuid(),
  date_depense date not null,
  fournisseur text,
  description text,
  categorie text not null check (
    categorie in (
      'viande', 'boissons', 'legumes_epicerie', 'emballages', 'gaz_eau_electricite', 'loyer',
      'salaires', 'carburant_transport', 'materiel', 'assurance_banque_comptable', 'publicite', 'autre'
    )
  ),
  montant numeric(10, 2) not null check (montant >= 0),
  mode_paiement text check (mode_paiement in ('especes', 'carte', 'virement', 'prelevement', 'cheque')),
  lignes jsonb not null default '[]'::jsonb,
  facture_chemin text,
  facture_type text check (facture_type in ('jpg', 'png', 'pdf', 'webp')),
  saisi_par uuid references profils (id),
  created_at timestamptz not null default now()
);

create index if not exists depenses_date_idx on depenses (date_depense desc);

comment on table depenses is 'Achats et charges de 3 Sauces (patron uniquement), avec facture en photo et lignes détaillées.';

alter table depenses enable row level security;

-- Bucket privé pour les photos de factures (accès uniquement par le serveur, via liens temporaires).
insert into storage.buckets (id, name, public)
values ('factures', 'factures', false)
on conflict (id) do nothing;
