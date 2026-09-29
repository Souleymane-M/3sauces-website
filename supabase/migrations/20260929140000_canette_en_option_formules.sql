-- La canette n'est plus incluse dans le prix de base des formules Tacos /
-- Barquette / Bowl : le prix affiche desormais le plat SEUL, et la canette
-- se rajoute en option a +1,50€ dans le configurateur (inverse du systeme
-- precedent, ou elle etait incluse par defaut avec une case "Sans boisson"
-- pour la retirer et economiser 1,50€). Le prix maximum du client ne
-- change pas (plat + canette = meme total qu'avant).
--
-- Supprime aussi les extras (viande/sauce supplementaire) sur ces memes
-- produits - trop de distraction pour un client presse, cf. discussion
-- produit du 2026-09-29. Le mecanisme lui-meme (autorise_extras) reste
-- disponible pour d'autres produits, jamais retire du code.
update produits
set prix = round((prix - 1.5)::numeric, 2),
    autorise_extras = false
where canette_incluse = true
  and categorie = 'snacking';
