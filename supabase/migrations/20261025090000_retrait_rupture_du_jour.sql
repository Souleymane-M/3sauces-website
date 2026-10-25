-- Retrait du raccourci "rupture du jour" (2026-10-24) : jugé moche,
-- dangereux et distrayant une fois vu en vrai (demande explicite du
-- patron, 2026-10-25). La gestion d'un produit indisponible reste
-- possible via le rôle métier "Produits" (actif/inactif, stock du jour).
alter table produits drop column if exists rupture_le;
