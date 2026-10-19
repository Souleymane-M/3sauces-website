-- Chantier "interface équipe unifiée" (2026-10-19) : un profil peut cumuler
-- plusieurs rôles métier (ex: la même personne fait cuisine ET comptoir),
-- alors que `profils.role` reste le TYPE DE COMPTE (employe/livreur/patron)
-- qui détermine uniquement le mécanisme de connexion (PIN seul / PIN seul /
-- mot de passe). Les deux notions sont désormais séparées :
-- `profils.role` = comment on se connecte, `profil_roles.role_metier` =
-- ce qu'on a le droit de voir/faire une fois connecté.
create table if not exists profil_roles (
  profil_id uuid not null references profils (id) on delete cascade,
  role_metier text not null check (role_metier in ('cuisine', 'comptoir', 'livreur', 'patron')),
  created_at timestamptz not null default now(),
  primary key (profil_id, role_metier)
);

alter table profil_roles enable row level security;

comment on table profil_roles is
  'Rôles métier (permissions/vues) attribués à un profil, plusieurs-à-plusieurs. '
  'Distinct de profils.role (type de compte = mécanisme de connexion).';

-- Backfill sans perte de capacité : chaque compte garde accès à tout ce
-- qu'il pouvait déjà faire avant ce chantier. Un compte "employe" existant
-- faisait aussi bien de la cuisine que du comptoir (un seul écran /commandes
-- + /caisse partagés) : on lui donne les deux rôles, à affiner ensuite
-- depuis le Pilotage si besoin de restreindre quelqu'un.
insert into profil_roles (profil_id, role_metier)
select id, 'cuisine' from profils where role = 'employe'
union all
select id, 'comptoir' from profils where role = 'employe'
union all
select id, 'livreur' from profils where role = 'livreur'
union all
select id, 'patron' from profils where role = 'patron'
on conflict (profil_id, role_metier) do nothing;

-- Sous quel rôle métier l'action a été faite — utile une fois qu'un même
-- profil peut agir en cuisine ou au comptoir. Nullable : l'historique
-- existant n'a pas cette info et ne doit pas être réécrit a posteriori.
alter table commandes_evenements add column if not exists role_metier text;
alter table commandes_evenements add constraint commandes_evenements_role_metier_check
  check (role_metier is null or role_metier in ('cuisine', 'comptoir', 'livreur', 'patron'));
