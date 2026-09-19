-- Jours de fermeture hebdomadaire, convention JS Date.getUTCDay() :
-- 0 = dimanche, 1 = lundi ... 6 = samedi. Distinct de site_ouvert (pause
-- manuelle globale, inchangé) : cette colonne ne bloque JAMAIS l'accès au
-- site, elle restreint seulement les dates de retrait proposées sur
-- /commander et impose le paiement en ligne pour une date différente
-- d'aujourd'hui. Par défaut : samedi et dimanche fermés.
alter table parametres_livraison
  add column if not exists jours_fermeture smallint[] not null default '{0,6}'::smallint[];

-- Garde-fou : jours valides (0-6) et jamais les 7 à la fois — sinon plus
-- aucune date de retrait possible, site silencieusement incommandable.
alter table parametres_livraison
  drop constraint if exists parametres_livraison_jours_fermeture_valides;
alter table parametres_livraison
  add constraint parametres_livraison_jours_fermeture_valides
  check (
    jours_fermeture <@ array[0,1,2,3,4,5,6]::smallint[]
    and not (array[0,1,2,3,4,5,6]::smallint[] <@ jours_fermeture)
  );
