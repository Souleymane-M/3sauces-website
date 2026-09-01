-- Extensions nécessaires (gen_random_uuid, etc.)
create extension if not exists pgcrypto;

-- Fonction utilitaire : met à jour automatiquement updated_at sur UPDATE
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Trigger générique : renseigne updated_at = now() à chaque UPDATE.';
