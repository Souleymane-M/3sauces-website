-- Message du moment imprimé sur les reçus clients (pas le bon de cuisine),
-- modifiable depuis /patron. Inactif ou vide = aucune ligne imprimée.
alter table parametres_livraison
  add column if not exists message_moment text,
  add column if not exists message_moment_actif boolean not null default false;
