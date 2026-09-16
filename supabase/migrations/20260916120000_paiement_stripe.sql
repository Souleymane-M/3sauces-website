-- Ajoute le mode de paiement en ligne (Stripe, site 3sauces.fr) aux
-- contraintes CHECK existantes sur commandes.mode_paiement et
-- paiements.mode, jusqu'ici limitées a especes/cb (paiement en personne).
-- Noms de contraintes confirmes par introspection directe (cf.
-- packages/supabase/src/types.ts).

alter table commandes drop constraint if exists commandes_mode_paiement_check;
alter table commandes add constraint commandes_mode_paiement_check
  check (mode_paiement in ('especes', 'cb', 'stripe'));

alter table paiements drop constraint if exists paiements_mode_check;
alter table paiements add constraint paiements_mode_check
  check (mode in ('especes', 'cb', 'stripe'));
