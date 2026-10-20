-- Permet de "relâcher" une livraison en cours (le livreur ne peut plus la
-- faire, ou le comptoir reprend la main) : la commande redevient "prête" et
-- repart au pot commun, mais le livreur qui l'a relâchée est temporairement
-- exclu de la reprise automatique par QR, pour éviter qu'un geste réflexe
-- (rescanner le même ticket) ne la lui réattribue par erreur.
alter table livraisons add column if not exists livreur_exclu_id uuid references profils (id);

comment on column livraisons.livreur_exclu_id is
  'Dernier livreur à avoir relâché cette livraison en cours de route — exclu '
  'de la reprise par QR tant qu''un collègue ou le comptoir ne l''a pas '
  'réattribuée (remis à null dès qu''un autre livreur la reprend).';
