-- Remise de lancement automatique (-2€ dès 10€, site public uniquement).
-- Dates nullables : si l'une des deux est absente, la remise est inactive.
-- Pré-remplie avec l'opération de lancement communiquée (28/09 - 09/10
-- 2026) ; modifiable depuis /patron pour une future opération similaire.
alter table parametres_livraison
  add column if not exists remise_lancement_debut date null,
  add column if not exists remise_lancement_fin date null;

update parametres_livraison
set remise_lancement_debut = '2026-09-28',
    remise_lancement_fin = '2026-10-09'
where id = true;
