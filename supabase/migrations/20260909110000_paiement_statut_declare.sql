-- Corrige une contrainte decouverte pendant les tests du module livreur :
-- `commandes.paiement_statut` a en realite deja une contrainte existante
-- (nommee automatiquement par Postgres a la creation originale de la
-- table, non versionnee - meme situation deja rencontree sur
-- `commandes.statut`, cf. 20260908090000_tracabilite_commandes.sql) qui
-- ne permettait que 'non_paye' / 'paye' / 'remboursee'. Le nouveau statut
-- applicatif 'declare' (livreur a declare le paiement, en attente de
-- validation caisse/patron) la violait silencieusement.
alter table commandes drop constraint if exists commandes_paiement_statut_check;
alter table commandes add constraint commandes_paiement_statut_check
  check (paiement_statut in ('non_paye', 'declare', 'paye', 'remboursee'));
