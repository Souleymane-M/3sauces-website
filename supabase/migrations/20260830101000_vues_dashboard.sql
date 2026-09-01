-- Vues de calcul pour le dashboard patron (Module 6) et les archives de lots
-- (Module 3). Lecture seule, à interroger via la clé service_role côté serveur.
--
-- HYPOTHÈSE DE STRUCTURE pour `commandes.contenu` (jsonb), à valider/ajuster
-- lors du développement du Module 1 (prise de commande) :
--
-- [
--   {
--     "produit_id": "uuid",
--     "nom": "Tacos 2 viandes",
--     "quantite": 1,
--     "prix_unitaire": 11.50,
--     "cout_matiere_unitaire": 4.37,
--     "viandes": ["Kebab", "Merguez"]
--   },
--   ...
-- ]

-- CA du jour, par canal (sur place / emporter / livraison / en ligne).
create or replace view v_ca_jour as
select
  canal,
  count(*) as nb_commandes,
  sum(montant) as ca
from commandes
where paiement_statut = 'paye'
  and created_at >= date_trunc('day', now())
  and created_at < date_trunc('day', now()) + interval '1 day'
group by canal;

comment on view v_ca_jour is 'CA du jour par canal. Filtrer/sommer côté appli pour le total global.';

-- Marge brute du jour = somme(montant) - somme(cout_matiere_total) sur les commandes payées du jour.
-- Règle absolue du brief : aucune donnée de vente sans son coût associé —
-- cout_matiere_total doit être renseigné à la création de la commande (Module 1).
create or replace view v_marge_brute_jour as
select
  sum(montant) as ca_jour,
  sum(coalesce(cout_matiere_total, 0)) as cout_matiere_jour,
  sum(montant) - sum(coalesce(cout_matiere_total, 0)) as marge_brute_jour,
  count(*) filter (where cout_matiere_total is null) as commandes_sans_cout -- doit rester à 0
from commandes
where paiement_statut = 'paye'
  and created_at >= date_trunc('day', now())
  and created_at < date_trunc('day', now()) + interval '1 day';

comment on view v_marge_brute_jour is
  'commandes_sans_cout doit toujours être 0 (règle absolue : pas de vente sans coût).';

-- Produit le plus rentable du jour, en marge € (pas en volume) — 3e chiffre du dashboard.
create or replace view v_produit_plus_rentable_jour as
select
  ligne ->> 'produit_id' as produit_id,
  ligne ->> 'nom' as nom,
  sum((ligne ->> 'quantite')::numeric) as quantite_vendue,
  sum(
    ((ligne ->> 'prix_unitaire')::numeric - coalesce((ligne ->> 'cout_matiere_unitaire')::numeric, 0))
    * (ligne ->> 'quantite')::numeric
  ) as marge_totale
from commandes c
cross join lateral jsonb_array_elements(c.contenu) as ligne
where c.paiement_statut = 'paye'
  and c.created_at >= date_trunc('day', now())
  and c.created_at < date_trunc('day', now()) + interval '1 day'
group by ligne ->> 'produit_id', ligne ->> 'nom'
order by marge_totale desc;

comment on view v_produit_plus_rentable_jour is
  'Classement des produits par marge € du jour. Prendre la 1ère ligne pour le dashboard.';

-- Ticket moyen du jour.
create or replace view v_ticket_moyen_jour as
select
  case when count(*) = 0 then 0 else sum(montant) / count(*) end as ticket_moyen
from commandes
where paiement_statut = 'paye'
  and created_at >= date_trunc('day', now())
  and created_at < date_trunc('day', now()) + interval '1 day';

-- Archives de lots épuisés : CA généré, marge réelle, portions, durée d'écoulement.
create or replace view v_lots_archives as
select
  l.id as lot_id,
  a.nom as article,
  l.quantite_achetee,
  l.prix_paye,
  l.date_ouverture,
  l.date_cloture,
  (l.date_cloture - l.date_ouverture) as duree_ecoulement,
  coalesce(sum(m.quantite_deduite), 0) as quantite_totale_deduite,
  count(distinct m.commande_id) as nb_commandes_concernees
from lots l
join articles_stock a on a.id = l.article_stock_id
left join lot_mouvements m on m.lot_id = l.id
where l.statut = 'epuise'
group by l.id, a.nom, l.quantite_achetee, l.prix_paye, l.date_ouverture, l.date_cloture;

comment on view v_lots_archives is
  'CA/marge exacts par lot à calculer côté appli en croisant nb_commandes_concernees '
  'avec commandes.montant (le lien précis dépend du détail de contenu jsonb).';

-- Récapitulatif du jour pour un livreur (Écran 3 du Module 2).
create or replace view v_recap_livreur_jour as
select
  livreur_id,
  count(*) as nb_livraisons,
  avg(extract(epoch from (heure_livraison_effective - heure_depart_cuisine)) / 60) as temps_moyen_minutes,
  count(*) filter (where heure_livraison_effective > heure_souhaitee) as nb_retards
from livraisons
where statut = 'livre'
  and heure_livraison_effective >= date_trunc('day', now())
  and heure_livraison_effective < date_trunc('day', now()) + interval '1 day'
group by livreur_id;
