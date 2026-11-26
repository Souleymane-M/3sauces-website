-- Suivi des offres sur chaque commande, pour mesurer leur effet (demande du patron, 27/11/2026) :
--   offres_disponibles : offres ouvertes pour cette commande (site seulement) — même si le panier ne les a pas déclenchées ;
--   offres_appliquees  : offres réellement déclenchées ('canette', 'box', 'boisson_2l', 'menu_etudiant') ;
--   nb_canettes_offertes : nombre de canettes offertes sur la commande.
alter table commandes add column if not exists offres_disponibles text[] not null default '{}';
alter table commandes add column if not exists offres_appliquees text[] not null default '{}';
alter table commandes add column if not exists nb_canettes_offertes integer not null default 0;

-- Rattrapage des commandes déjà passées : offres appliquées déduites des lignes de la commande.
update commandes c set
  offres_appliquees = array_remove(array[
    case when exists (select 1 from jsonb_array_elements(c.contenu) l where l->>'nom' ilike '%(offerte — offre du jour)%') then 'canette' end,
    case when exists (select 1 from jsonb_array_elements(c.contenu) l where l->>'nom' like 'BOX OFFERTE%') then 'box' end,
    case when exists (select 1 from jsonb_array_elements(c.contenu) l where l->>'nom' ilike '%(offerte — commande groupée)%') then 'boisson_2l' end,
    case when exists (select 1 from jsonb_array_elements(c.contenu) l where l->>'offert' = 'true') then 'menu_etudiant' end
  ], null),
  nb_canettes_offertes = coalesce((
    select sum((l->>'quantite')::int) from jsonb_array_elements(c.contenu) l where l->>'nom' ilike '%(offerte — offre du jour)%'
  ), 0)
where jsonb_typeof(c.contenu) = 'array';

-- Rattrapage des offres disponibles (commandes du site) : canette les jours d'offre, box le 18/11, menu étudiant du 26/11 16 h au 27/11.
update commandes c set offres_disponibles = array_append(c.offres_disponibles, 'canette')
where c.commande_par is null and c.heure_souhaitee is not null
  and ((c.heure_souhaitee at time zone 'Indian/Mayotte')::date in ('2026-11-13', '2026-11-23')
       or (c.heure_souhaitee at time zone 'Indian/Mayotte')::date between '2026-11-25' and '2026-12-12');
update commandes c set offres_disponibles = array_append(c.offres_disponibles, 'box')
where c.commande_par is null and c.heure_souhaitee is not null
  and (c.heure_souhaitee at time zone 'Indian/Mayotte')::date = '2026-11-18';
update commandes c set offres_disponibles = array_append(c.offres_disponibles, 'menu_etudiant')
where c.commande_par is null and c.created_at >= '2026-11-26T13:00:00Z' and c.created_at < '2026-11-27T21:00:00Z';
