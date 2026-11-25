-- Confirmation de l'email du client (demande du patron, 2026-11-25) : un compte fidélité n'est « activé » que lorsque
-- le client a cliqué sur le lien reçu par email. Sans cela, ses points de fidélité s'accumulent mais ses récompenses
-- restent verrouillées (site et caisse).

alter table clients
  add column if not exists email_confirme_le timestamptz;

-- Demandes de confirmation en attente : seul l'empreinte du lien est conservée, jamais le lien lui-même.
create table if not exists confirmations_email (
  id uuid primary key default gen_random_uuid(),
  telephone text not null,
  email text not null,
  jeton_hash text not null unique,
  accepte_offres boolean not null default false,
  expire_le timestamptz not null,
  utilise_le timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists confirmations_email_telephone_idx on confirmations_email (telephone, created_at desc);
alter table confirmations_email enable row level security;

-- Clients déjà connus : on considère confirmé l'email d'un client qui a déjà commandé SUR LE SITE (il l'a saisi lui-même
-- pour sa commande). Les emails rattachés d'une autre façon (saisie en caisse, ancienne page « lier mon email ») restent
-- à confirmer.
update clients c
set email_confirme_le = now()
where c.email is not null
  and c.email_confirme_le is null
  and exists (
    select 1 from commandes o
    where o.client_telephone = c.telephone
      and o.commande_par is null
  );
