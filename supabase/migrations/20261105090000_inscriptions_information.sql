-- Inscriptions aux informations de réouverture et aux offres de 3 Sauces (demande du patron, 2026-11-05).
-- RGPD : on garde la preuve du consentement (date + texte accepté), le choix « offres » est séparé
-- de l'information de réouverture, et chaque inscrit a un jeton pour se désinscrire en un clic.
-- Table lue/écrite uniquement par le serveur (service role) : RLS activé, aucune politique publique.
create table if not exists inscriptions_information (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  accepte_offres boolean not null default false,
  consentement_le timestamptz not null default now(),
  texte_consentement text not null,
  source text not null default 'site_ferme',
  jeton_desinscription uuid not null default gen_random_uuid() unique,
  desinscrit_le timestamptz,
  created_at timestamptz not null default now()
);

comment on table inscriptions_information is 'Emails collectés pour informer de la réouverture / envoyer des offres (consentement RGPD).';

alter table inscriptions_information enable row level security;
