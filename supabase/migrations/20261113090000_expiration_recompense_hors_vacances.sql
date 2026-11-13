-- Une récompense fidélité ne doit jamais expirer en pleine période de vacances scolaires (demande du patron,
-- 2026-11-13) : si sa date limite tombe pendant des vacances, elle est repoussée à 7 jours après la reprise.
-- Périodes lues dans une petite table à mettre à jour une fois par an ; règle appliquée par un trigger sur
-- fidelite_tampons (aucune des fonctions de fidélité existantes n'est modifiée, et la règle est idempotente).
-- `fin` = dernier jour de vacances (inclus), donc la reprise a lieu le lendemain.
-- À compléter : vacances de l'université de Mayotte (le patron doit communiquer les dates).
create table if not exists periodes_vacances (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  debut date not null,
  fin date not null,
  created_at timestamptz not null default now(),
  check (fin >= debut)
);

comment on table periodes_vacances is 'Vacances scolaires de Mayotte : une récompense fidélité ne peut pas expirer pendant (fin = dernier jour inclus).';

alter table periodes_vacances enable row level security;

insert into periodes_vacances (libelle, debut, fin)
select v.libelle, v.debut::date, v.fin::date
from (values
  ('Toussaint 2026',         '2026-10-10', '2026-10-25'),
  ('Noël 2026',              '2026-12-12', '2027-01-10'),
  ('Carnaval 2027',          '2027-02-20', '2027-03-07'),
  ('Printemps 2027',         '2027-05-01', '2027-05-17'),
  ('Vacances d''été 2027',   '2027-07-03', '2027-08-22')
) as v(libelle, debut, fin)
where not exists (select 1 from periodes_vacances p where p.libelle = v.libelle);

create or replace function ajuster_expiration_recompense(p_date timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_jour date := (p_date at time zone 'Indian/Mayotte')::date;
  v_fin date;
begin
  select max(fin) into v_fin from periodes_vacances where v_jour between debut and fin;
  if v_fin is null then
    return p_date;
  end if;
  -- reprise = fin + 1 ; on laisse 7 jours après la reprise, jusqu'à la fin de la journée (heure de Mayotte).
  return ((v_fin + 8)::timestamp + time '23:59:59') at time zone 'Indian/Mayotte';
end;
$$;

create or replace function trg_ajuster_expiration_tampon()
returns trigger
language plpgsql
as $$
begin
  new.date_expiration := ajuster_expiration_recompense(new.date_expiration);
  return new;
end;
$$;

drop trigger if exists ajuster_expiration_tampon on fidelite_tampons;
create trigger ajuster_expiration_tampon
  before insert or update of date_expiration on fidelite_tampons
  for each row execute function trg_ajuster_expiration_tampon();

-- Récompenses déjà en circulation : même règle (le trigger recalcule la date).
update fidelite_tampons
set date_expiration = date_expiration
where not utilise and date_expiration > now();
