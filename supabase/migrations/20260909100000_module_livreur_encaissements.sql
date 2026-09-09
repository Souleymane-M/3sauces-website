-- Module livreur : declaration et validation des encaissements a la
-- livraison. Un client peut payer en un seul mode, en mixte (especes +
-- CB), ou une commande groupee peut avoir plusieurs payeurs distincts —
-- la table `paiements` supporte deja plusieurs lignes par commande, on
-- l'etend au lieu de creer une table parallele.

alter table paiements add column if not exists declare_par_livreur_id uuid references profils (id);
alter table paiements add column if not exists payeur text;

comment on column paiements.declare_par_livreur_id is
  'Renseigne uniquement quand ce paiement a ete declare par un livreur '
  '(vs un encaissement direct a la caisse). NULL sinon.';
comment on column paiements.payeur is
  'Etiquette libre pour une commande groupee a plusieurs payeurs (ex: '
  '"Etudiant 2"). NULL pour un paiement a payeur unique.';

-- "Signaler un ecart" cote caisse/patron : ne change jamais
-- paiement_statut, juste un signalement pour revue.
alter table commandes add column if not exists alerte_signalee boolean not null default false;
alter table commandes add column if not exists alerte_note text;
alter table commandes add column if not exists alerte_signalee_par uuid references profils (id);
alter table commandes add column if not exists alerte_signalee_le timestamptz;

comment on column commandes.alerte_signalee is
  'Ecart signale par la caisse/le patron sur cette commande (ex: montant '
  'declare douteux) - a revoir, ne bloque jamais le paiement.';

-- Pas de contrainte CHECK sur paiement_statut (aucune n''existe deja) :
-- 'declare' est un nouveau statut applicatif entre 'non_paye' (pas encore
-- livree) et 'paye' (valide par la caisse/le patron) - le trigger
-- commandes_appliquer_fidelite ne reagit qu''au passage a 'paye', quelle
-- que soit la valeur precedente, donc rien a y changer.

-- Total especes vs CB du jour (Ecran /patron), meme convention que
-- v_ca_jour (20260830101000_vues_dashboard.sql).
create or replace view v_encaissements_jour as
select
  p.mode,
  sum(p.montant) as total
from paiements p
join commandes c on c.id = p.commande_id
where c.paiement_statut = 'paye'
  and p.created_at >= date_trunc('day', now())
  and p.created_at < date_trunc('day', now()) + interval '1 day'
group by p.mode;

comment on view v_encaissements_jour is
  'Total encaisse du jour par mode de paiement (especes/cb), tous canaux '
  'confondus.';
