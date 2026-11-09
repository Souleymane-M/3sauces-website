-- Commentaire libre du livreur sur une livraison (sauce, boisson, couverts oublies...) : facultatif,
-- sert a reperer les petits oublis pour former le personnel.
alter table commandes add column if not exists commentaire_livreur text;
