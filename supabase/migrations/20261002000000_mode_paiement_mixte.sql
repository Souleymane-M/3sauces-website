-- Paiement comptoir mixte (espèces + carte) : la commande peut porter
-- "mixte" sur sa colonne mode_paiement, mais chaque ligne de `paiements`
-- reste un mode réel (jamais "mixte" lui-même — toujours "especes" ou "cb"
-- individuellement, une ligne par part).

alter table commandes drop constraint if exists commandes_mode_paiement_check;
alter table commandes add constraint commandes_mode_paiement_check
  check (mode_paiement in ('especes', 'cb', 'stripe', 'mixte'));
