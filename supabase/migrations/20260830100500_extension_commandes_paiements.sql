-- On étend les tables `commandes` et `paiements` existantes plutôt que de les
-- dupliquer. `tables` et `sessions_table` restent intactes et non branchées
-- au nouveau flux pour l'instant (décision produit du 2026-08-30).

alter table commandes
  add column if not exists client_telephone text references clients (telephone),
  add column if not exists commande_par uuid references profils (id), -- employé ou livreur qui a saisi la commande
  add column if not exists cout_matiere_total numeric(10, 2), -- somme des coûts matière, pour calcul de marge (Module 6)
  add column if not exists recompense_appliquee boolean not null default false,
  add column if not exists nom_livraison text, -- nom du client si canal = livraison
  add column if not exists adresse_livraison text,
  add column if not exists heure_souhaitee timestamptz;

comment on column commandes.contenu is
  'JSON détaillant les lignes de commande : produit_id, format, viandes choisies par '
  'slot, quantité, prix unitaire. Structure applicative, pas de table commande_lignes séparée.';

comment on column commandes.client_telephone is
  'Rattache la commande au client fidélité (Module 5). NULL si client non identifié.';

-- Distinction des deux systèmes de paiement (Section 5 du brief) :
-- SumUp = caisse physique uniquement, Stripe = site 3sauces.fr uniquement.
alter table paiements
  add column if not exists sumup_transaction_id text;

comment on column paiements.mode is
  'cash | sumup | stripe | en_ligne. SumUp = caisse physique, Stripe = site uniquement.';

comment on column paiements.stripe_payment_id is
  'Renseigné uniquement pour les paiements site (Stripe). NULL pour la caisse physique.';

comment on column paiements.sumup_transaction_id is
  'Renseigné uniquement pour les paiements caisse physique (terminal SumUp). NULL pour le site.';
