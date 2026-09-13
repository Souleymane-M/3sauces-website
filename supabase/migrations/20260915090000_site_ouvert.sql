-- Interrupteur permettant au patron de mettre le site public en pause
-- (fermé aux commandes) depuis /patron, sans déploiement.
alter table parametres_livraison
  add column if not exists site_ouvert boolean not null default true;
