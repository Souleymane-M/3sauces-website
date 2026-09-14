-- Nombre de "plats principaux" dans la commande, calculé côté serveur à
-- l'enregistrement (jamais confiance dans un total envoyé par le client).
-- Sert à dériver la priorité livraison (canal = 'livraison' et nb_plats
-- >= 3) en cuisine et chez le livreur — pas de colonne "prioritaire"
-- séparée, pour ne jamais avoir à migrer si le seuil change.
alter table commandes
  add column if not exists nb_plats integer not null default 0;
