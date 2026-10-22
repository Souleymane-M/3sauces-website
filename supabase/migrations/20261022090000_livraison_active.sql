-- Interrupteur dédié "livraison activée/désactivée", distinct de
-- site_ouvert (qui coupe tout le site) et des zones_livraison (qui
-- définissent QUELLES communes sont livrées) : permet au patron de
-- couper uniquement le canal livraison en un clic depuis /patron (ex :
-- aucun livreur disponible aujourd'hui) sans fermer tout le site ni
-- désactiver une à une les zones.

alter table parametres_livraison add column if not exists livraison_active boolean not null default true;

comment on column parametres_livraison.livraison_active is
  'Active/désactive le canal livraison partout (site public + caisse) sans toucher aux zones ni fermer le site. Revérifié côté serveur à chaque création de commande.';
