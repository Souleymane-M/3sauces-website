-- Traçabilité commandes (nouvelle page /commandes pour la cuisine) : chaque
-- changement de statut enregistre qui (employé) et quand, avec un historique
-- complet consultable depuis /patron.

-- Historique complet : une ligne par changement de statut. "en_attente"
-- n'y figure jamais - c'est l'état initial automatique a la reception, pas
-- une action d'un employe.
create table if not exists commandes_evenements (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes (id),
  statut text not null check (
    statut in ('en_preparation', 'pret', 'remis_au_client', 'pris_par_livreur', 'livre')
  ),
  profil_id uuid not null references profils (id),
  created_at timestamptz not null default now()
);

create index if not exists commandes_evenements_commande_id_idx on commandes_evenements (commande_id);

alter table commandes_evenements enable row level security;

comment on table commandes_evenements is
  'Historique des changements de statut d''une commande : qui (profil_id) '
  'et quand, pour le suivi patron (temps de preparation moyen, qui a '
  'livre quoi).';

-- `commandes.statut` a en realite deja une contrainte existante (nommee
-- automatiquement par Postgres a la creation originale de la table, non
-- versionnee) qui limite aux 3 anciennes valeurs ('recue','en_preparation',
-- 'livree') - il faut la retirer avant de reecrire les lignes existantes,
-- sinon la mise a jour ci-dessous echoue.
-- Flux complet : en_attente -> en_preparation -> pret -> remis_au_client
-- (sur place/a emporter) ou pris_par_livreur -> livre (livraison, flash QR
-- du livreur - Module 2, pas encore construit).
alter table commandes drop constraint if exists commandes_statut_check;

update commandes set statut = 'en_attente' where statut = 'recue';
update commandes set statut = 'livre' where statut = 'livree' and canal = 'livraison';
update commandes set statut = 'remis_au_client' where statut = 'livree' and canal <> 'livraison';

alter table commandes alter column statut set default 'en_attente';
alter table commandes add constraint commandes_statut_check
  check (statut in ('en_attente', 'en_preparation', 'pret', 'remis_au_client', 'pris_par_livreur', 'livre'));
