-- v_produit_plus_rentable_jour a ete ecrite avant que le schema reel de
-- `commandes.contenu` (jsonb) n'existe, sur une hypothese de cles snake_case
-- ("produit_id", "prix_unitaire", "cout_matiere_unitaire") jamais mise a
-- jour depuis. Le Module 1 (prise de commande) utilise en realite des cles
-- camelCase ("produitId", "prixUnitaire", "coutMatiereUnitaire") - la vue
-- ne retournait donc jamais aucune ligne exploitable, jamais branchee cote
-- appli faute d'avoir ete testee avec de vraies commandes.
create or replace view v_produit_plus_rentable_jour as
select
  ligne ->> 'produitId' as produit_id,
  ligne ->> 'nom' as nom,
  sum((ligne ->> 'quantite')::numeric) as quantite_vendue,
  sum(
    ((ligne ->> 'prixUnitaire')::numeric - coalesce((ligne ->> 'coutMatiereUnitaire')::numeric, 0))
    * (ligne ->> 'quantite')::numeric
  ) as marge_totale
from commandes c
cross join lateral jsonb_array_elements(c.contenu) as ligne
where c.paiement_statut = 'paye'
  and c.created_at >= date_trunc('day', now())
  and c.created_at < date_trunc('day', now()) + interval '1 day'
group by ligne ->> 'produitId', ligne ->> 'nom'
order by marge_totale desc;

comment on view v_produit_plus_rentable_jour is
  'Classement des produits par marge € du jour (cles JSON camelCase, alignees sur le schema reel de commandes.contenu). Prendre la 1ère ligne pour le dashboard.';
