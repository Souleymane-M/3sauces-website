-- Tiroir-caisse (demande explicite du patron, 2026-10-25) : enregistrer le
-- fonds de caisse AVANT le service, les sorties d'espèces pendant la
-- journée, puis le comptage de fin de journée comparé au montant attendu.
--
-- Journal en ajout seul : jamais de UPDATE/DELETE d'une saisie par un
-- employé. Une erreur se corrige en annulant la ligne (annule_le/annule_par,
-- réservé au patron) puis en la ressaisissant — l'historique reste intact.
create table if not exists mouvements_caisse (
  id uuid primary key default gen_random_uuid(),
  -- Jour de service, fuseau Mayotte (jamais déduit de created_at en UTC).
  date_jour date not null,
  type text not null check (type in ('ouverture', 'sortie', 'cloture')),
  -- Ouverture/clôture : total du billetage, recalculé côté serveur.
  -- Sortie : montant sorti du tiroir.
  montant numeric(10, 2) not null check (montant >= 0),
  -- Billetage (ouverture/clôture) : { "5000": 2, "100": 7, ... } = valeur
  -- en centimes -> nombre de billets/pièces.
  detail jsonb,
  -- Sortie uniquement, obligatoire.
  motif text,
  -- Clôture uniquement : instantané au moment de la validation, jamais
  -- recalculé ensuite (un paiement tardif ne doit pas réécrire l'historique).
  attendu numeric(10, 2),
  ecart numeric(10, 2),
  profil_id uuid not null references profils (id),
  created_at timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references profils (id),
  constraint mouvements_caisse_motif_sortie
    check (type <> 'sortie' or (motif is not null and length(trim(motif)) > 0)),
  constraint mouvements_caisse_cloture_complete
    check (type <> 'cloture' or (attendu is not null and ecart is not null))
);

-- Un seul fonds de départ et une seule clôture par jour (hors lignes
-- annulées) : un double clic ou un second appareil ne peut jamais en créer
-- deux, la base refuse.
create unique index if not exists mouvements_caisse_ouverture_unique
  on mouvements_caisse (date_jour) where type = 'ouverture' and annule_le is null;
create unique index if not exists mouvements_caisse_cloture_unique
  on mouvements_caisse (date_jour) where type = 'cloture' and annule_le is null;
create index if not exists mouvements_caisse_jour_idx on mouvements_caisse (date_jour);

alter table mouvements_caisse enable row level security;

comment on table mouvements_caisse is
  'Journal du tiroir-caisse (fonds de départ, sorties d''espèces, comptage de fin de journée). Ajout seul : une correction passe par annule_le/annule_par (patron), jamais par modification.';

-- v_encaissements_jour comptait la "journée" en UTC (date_trunc sur now()
-- sans fuseau), pas en heure de Mayotte (UTC+3) : mêmes colonnes, seule la
-- borne du jour change.
create or replace view v_encaissements_jour as
select
  p.mode,
  sum(p.montant) as total
from paiements p
join commandes c on c.id = p.commande_id
where c.paiement_statut = 'paye'
  and p.created_at >= (date_trunc('day', now() at time zone 'Indian/Mayotte') at time zone 'Indian/Mayotte')
  and p.created_at < (date_trunc('day', now() at time zone 'Indian/Mayotte') at time zone 'Indian/Mayotte') + interval '1 day'
group by p.mode;
