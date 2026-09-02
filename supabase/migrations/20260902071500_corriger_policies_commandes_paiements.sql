-- Correctif suite à vérification post-déploiement de la migration RLS
-- précédente (20260902070000) : `commandes` et `paiements` restaient
-- lisibles avec la clé anon publique malgré `ENABLE ROW LEVEL SECURITY`.
-- Cause probable : une policy permissive (ex. "select using (true)")
-- créée manuellement lors des tout premiers tests de l'API Supabase,
-- avant que l'authentification maison (PIN/JWT) ne soit en place — ces
-- deux tables n'ont jamais été créées via une migration versionnée, donc
-- leur historique de policies n'est pas connu avec certitude.
--
-- On supprime dynamiquement toutes les policies existantes sur ces deux
-- tables (quel que soit leur nom), puis on force RLS. `force row level
-- security` n'a aucun effet sur `service_role` (qui a l'attribut
-- BYPASSRLS et ignore RLS dans tous les cas) : aucun impact sur l'app.

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('commandes', 'paiements')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.commandes enable row level security;
alter table public.paiements enable row level security;
alter table public.commandes force row level security;
alter table public.paiements force row level security;
