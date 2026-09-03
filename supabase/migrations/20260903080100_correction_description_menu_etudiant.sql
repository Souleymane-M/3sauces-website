-- Correction : le Menu Étudiant n'inclut pas de riz jaune, seulement des
-- frites (retour utilisateur du 2026-09-03, juste après l'ajout initial des
-- descriptions produits).
update produits set description = 'Mini Tacos 1 viande + Frites + Canette'
  where nom = 'Menu Étudiant';
