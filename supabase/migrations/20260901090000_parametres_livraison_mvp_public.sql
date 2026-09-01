-- MVP site commande en ligne (pivot du 2026-09-01) : la plage de créneaux de
-- livraison passe de 11h00–14h00 à 10h30–15h00, conformément au cahier des
-- charges du site public (Page 1 — sélecteur heure/minute 10h30 à 15h00).
-- Le minimum de commande (8€) et la zone active ("Dembéni") ne changent pas.
--
-- NB : cette valeur a déjà été appliquée manuellement en base (via l'API
-- REST service_role) le 2026-09-01 pour débloquer le développement immédiat ;
-- cette migration ne fait que documenter/rejouer ce changement de façon
-- versionnée et idempotente.

update parametres_livraison
set heure_debut = '10:30',
    heure_fin = '15:00'
where id = true;
