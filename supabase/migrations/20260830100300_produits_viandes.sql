-- Référentiel des viandes sélectionnables par slot (choix libre, pas de viande imposée).
create table if not exists viandes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  unite_deduction text not null check (unite_deduction in ('grammes', 'pieces')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into viandes (nom, unite_deduction) values
  ('Kebab', 'grammes'),
  ('Poulet', 'pieces'),
  ('Merguez', 'pieces'),
  ('Steak', 'pieces'),
  ('Cordon bleu', 'pieces')
on conflict (nom) do nothing;

-- Carte des produits — modifiable en temps réel par le patron uniquement,
-- propagée automatiquement caisse + site (Section 5 du brief).
create table if not exists produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  categorie text not null check (
    categorie in ('menu_special', 'snacking', 'grillade', 'cuisine_locale', 'boisson', 'supplement')
  ),

  prix numeric(10, 2), -- NULL autorisé pour le plat du jour (prix saisi chaque matin)
  cout_matiere numeric(10, 2), -- coût matière paramétré, modifiable patron uniquement

  canette_incluse boolean not null default false,
  nb_viandes_max integer not null default 0 check (nb_viandes_max between 0 and 3),

  -- Grammage de kebab consommé si "Kebab" est choisi sur un slot de ce produit.
  -- Valeurs de départ (110g / 150g / 190g selon format) — ajustables par le patron.
  grammage_kebab_g integer,

  actif boolean not null default true,
  est_plat_du_jour boolean not null default false,
  est_desactivable boolean not null default false, -- true pour poulpe, plat du jour

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger produits_set_updated_at
  before update on produits
  for each row
  execute function set_updated_at();

comment on table produits is
  'Carte 3 Sauces. Synchronisée caisse + site 3sauces.fr. Modification unique côté patron.';

-- Seed : carte paramétrée au lancement (Section 4 du brief).
insert into produits (nom, categorie, prix, cout_matiere, canette_incluse, nb_viandes_max, grammage_kebab_g, est_desactivable) values
  -- Menus spéciaux
  ('Menu Collégien', 'menu_special', 5.00, null, false, 1, 110, false),
  ('Menu Étudiant', 'menu_special', 8.00, null, true, 1, 110, false),

  -- Snacking (canette incluse)
  ('Tacos 1 viande', 'snacking', 9.50, 3.03, true, 1, 110, false),
  ('Barquette', 'snacking', 9.50, 3.03, true, 1, 110, false),
  ('Tacos Bowl', 'snacking', 9.50, 2.65, true, 1, 110, false),
  ('Tacos 2 viandes', 'snacking', 11.50, 4.37, true, 2, 150, false),
  ('Grande Barquette', 'snacking', 11.50, 5.00, true, 2, 150, false),
  ('Grand Tacos Bowl', 'snacking', 11.50, 4.40, true, 2, 150, false),
  ('Tacos 3 viandes', 'snacking', 14.50, 5.41, true, 3, 190, false),
  ('Viande supplémentaire', 'supplement', 3.00, null, false, 0, null, false),

  -- Grillades
  ('Brochettes bœuf x3', 'grillade', 2.00, 0.69, false, 0, null, false),
  ('Croupion x3', 'grillade', 2.00, 0.21, false, 0, null, false),
  ('Ailes x3', 'grillade', 2.50, 1.14, false, 0, null, false),
  ('Cuisse poulet', 'grillade', 3.00, 0.87, false, 0, null, false),
  ('Poisson grillé', 'grillade', 13.00, null, true, 0, null, false), -- + accomp + salade + canette ou eau
  ('Poulpe grillé', 'grillade', 16.00, null, false, 0, null, true),

  -- Cuisine locale
  ('Plat du jour', 'cuisine_locale', null, null, false, 0, null, true),

  -- Boissons
  ('Canette seule', 'boisson', 2.00, null, false, 0, null, false),
  ('Eau 50cl', 'boisson', 1.50, null, false, 0, null, false),
  ('Eau 1,5L', 'boisson', 2.00, null, false, 0, null, false),
  ('Boisson 2L', 'boisson', 6.00, null, false, 0, null, false)
on conflict (nom) do nothing;

-- Poulpe grillé et Plat du jour démarrent désactivés (activation manuelle).
update produits set actif = false where nom in ('Poulpe grillé', 'Plat du jour');

alter table viandes enable row level security;
alter table produits enable row level security;
