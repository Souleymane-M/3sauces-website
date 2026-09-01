-- ============================================================
-- 3 SAUCES — Schéma complet à appliquer dans Supabase SQL Editor
-- Régénéré le 2026-08-31 — concaténation des migrations dans l'ordre.
-- Fichiers sources : supabase/migrations/*.sql (conservés séparément
-- pour l'historique / futur usage avec la CLI Supabase).
-- ============================================================


-- ------------------------------------------------------------
-- Fichier source : 20260830100000_extensions_et_utils.sql
-- ------------------------------------------------------------
-- Extensions nécessaires (gen_random_uuid, etc.)
create extension if not exists pgcrypto;

-- Fonction utilitaire : met à jour automatiquement updated_at sur UPDATE
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Trigger générique : renseigne updated_at = now() à chaque UPDATE.';


-- ------------------------------------------------------------
-- Fichier source : 20260830100100_profils.sql
-- ------------------------------------------------------------
-- Profils utilisateurs : employé (PIN, comptoir), livreur (PIN, téléphone perso),
-- patron (mot de passe, accès distant complet).
--
-- Sécurité : on ne stocke JAMAIS le PIN/mot de passe en clair.
-- pin_hash / mot_de_passe_hash sont hashés côté serveur (ex: bcrypt) avant insertion.
-- La vérification se fait exclusivement via une route serveur utilisant la clé
-- service_role — jamais côté client.

create table if not exists profils (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  role text not null check (role in ('employe', 'livreur', 'patron')),

  -- PIN (employé/livreur) — 4 à 6 chiffres, hashé.
  pin_hash text,

  -- Mot de passe (patron uniquement) — hashé.
  mot_de_passe_hash text,

  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profils_pin_ou_mdp check (
    (role in ('employe', 'livreur') and pin_hash is not null and mot_de_passe_hash is null)
    or
    (role = 'patron' and mot_de_passe_hash is not null and pin_hash is null)
  )
);

create trigger profils_set_updated_at
  before update on profils
  for each row
  execute function set_updated_at();

-- Le PIN doit être unique parmi les profils actifs employé/livreur
-- (sinon un PIN pourrait identifier deux personnes différentes).
create unique index if not exists profils_pin_hash_unique_actif
  on profils (pin_hash)
  where role in ('employe', 'livreur') and actif = true;

comment on table profils is
  'Comptes internes : employés et livreurs (PIN) + patron (mot de passe). '
  'Auth custom gérée côté serveur, pas Supabase Auth (pas de compte client ici).';

-- RLS activé, aucune policy publique : seule la clé service_role (bypass RLS)
-- peut lire/écrire cette table pour l'instant. À affiner plus tard.
alter table profils enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100200_clients_fidelite.sql
-- ------------------------------------------------------------
-- Base client unifiée (caisse + site + livreur terrain) — Module 5.
-- Clé primaire = numéro de téléphone (normalisé E.164, ex: +33612345678),
-- conformément au brief.

create table if not exists clients (
  telephone text primary key,

  -- Cycle de fidélité en cours (remis à zéro après récompense utilisée ou expiration).
  montant_cumule numeric(10, 2) not null default 0 check (montant_cumule >= 0),
  tampons_acquis integer generated always as (floor(montant_cumule / 10)::int) stored,
  recompense_disponible boolean not null default false,

  date_premier_achat_cycle timestamptz,
  date_expiration timestamptz,

  -- Conformité RGPD / consentement SMS marketing.
  sms_optin boolean not null default false,
  date_optin timestamptz,
  sms_stop_at timestamptz, -- renseigné si le client répond STOP

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

comment on table clients is
  'Table client partagée caisse + site + livreur. 1 tampon = 10€ cumulés. '
  'Récompense à 10 tampons (100€) = 10€ offerts, valable 3 mois, non fractionnable.';

comment on column clients.tampons_acquis is
  'Calculé automatiquement = floor(montant_cumule / 10). Ne pas écrire directement.';

-- Journal des mouvements de fidélité : accumulation, récompense utilisée, expiration.
-- Sert d'historique/audit et de source pour les notifications SMS (Module 5).
create table if not exists fidelite_mouvements (
  id uuid primary key default gen_random_uuid(),
  client_telephone text not null references clients (telephone) on delete cascade,
  type text not null check (type in ('accumulation', 'recompense_disponible', 'recompense_utilisee', 'expiration')),
  montant numeric(10, 2), -- montant de la commande à l'origine de l'accumulation, si applicable
  commande_id uuid references commandes (id),
  created_at timestamptz not null default now()
);

create index if not exists fidelite_mouvements_client_idx
  on fidelite_mouvements (client_telephone, created_at desc);

alter table clients enable row level security;
alter table fidelite_mouvements enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100300_produits_viandes.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- Fichier source : 20260830100400_stocks_lots.sql
-- ------------------------------------------------------------
-- Module 3 — Stocks & lots.

create table if not exists fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  contact text,
  created_at timestamptz not null default now()
);

-- Articles de stock = matières premières achetées (distinct des "produits" vendus).
-- Un produit vendu (ex: Tacos 1 viande) consomme un ou plusieurs articles de stock
-- (ex: Kebab en grammes + riz/frites/crudités en portion standard).
create table if not exists articles_stock (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  unite_achat text not null check (unite_achat in ('kg', 'pieces', 'cartons', 'litres')),
  unite_deduction text not null check (unite_deduction in ('grammes', 'pieces', 'portions_3', 'portion_standard')),
  portion_standard numeric(10, 2), -- ex: grammage par portion standard riz/frites/crudités
  created_at timestamptz not null default now()
);

insert into articles_stock (nom, unite_achat, unite_deduction, portion_standard) values
  ('Kebab (broche)', 'kg', 'grammes', null),
  ('Poulet', 'kg', 'pieces', null),
  ('Merguez', 'pieces', 'pieces', null),
  ('Steak', 'pieces', 'pieces', null),
  ('Cordon bleu', 'pieces', 'pieces', null),
  ('Croupion', 'pieces', 'portions_3', null),
  ('Brochettes bœuf', 'pieces', 'portions_3', null),
  ('Ailes', 'pieces', 'portions_3', null),
  ('Cuisse poulet', 'pieces', 'pieces', null),
  ('Riz', 'kg', 'portion_standard', 150),
  ('Frites', 'kg', 'portion_standard', 150),
  ('Crudités', 'kg', 'portion_standard', 80),
  ('Canette', 'cartons', 'pieces', null),
  ('Poisson', 'kg', 'pieces', null),
  ('Poulpe', 'kg', 'portion_standard', 200)
on conflict (nom) do nothing;

comment on table articles_stock is
  'Matières premières achetées. Portions/grammages ajustables par le patron.';

-- Un lot = un achat fournisseur. Un seul lot "actif" à la fois par article_stock.
create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  article_stock_id uuid not null references articles_stock (id),
  fournisseur_id uuid references fournisseurs (id),

  quantite_achetee numeric(10, 2) not null check (quantite_achetee > 0),
  unite text not null,
  prix_paye numeric(10, 2) not null check (prix_paye >= 0),

  date_achat date not null default current_date,
  statut text not null default 'actif' check (statut in ('actif', 'epuise')),

  date_ouverture timestamptz not null default now(),
  date_cloture timestamptz,

  facture_id uuid, -- FK logique vers factures(id), voir migration factures_ocr

  created_at timestamptz not null default now()
);

-- Un seul lot actif par article de stock à la fois.
create unique index if not exists lots_un_seul_actif_par_article
  on lots (article_stock_id)
  where statut = 'actif';

create index if not exists lots_article_statut_idx on lots (article_stock_id, statut);

comment on table lots is
  'Un lot = un achat fournisseur pour un article de stock. '
  'Devient actif à la création, épuisé quand entièrement déduit (voir lot_mouvements).';

-- Chaque déduction de stock (servie sur une commande) est tracée ici,
-- ce qui permet de calculer CA/marge/portions/durée d'écoulement par lot (archive).
create table if not exists lot_mouvements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots (id),
  commande_id uuid references commandes (id),
  quantite_deduite numeric(10, 2) not null check (quantite_deduite > 0),
  created_at timestamptz not null default now()
);

create index if not exists lot_mouvements_lot_idx on lot_mouvements (lot_id, created_at);

alter table fournisseurs enable row level security;
alter table articles_stock enable row level security;
alter table lots enable row level security;
alter table lot_mouvements enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100500_extension_commandes_paiements.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- Fichier source : 20260830100600_livraisons.sql
-- ------------------------------------------------------------
-- Module 2 — Livraison & traçabilité QR code.

create table if not exists livraisons (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes (id),
  livreur_id uuid references profils (id), -- assigné au flash 1 (ou en amont)

  qr_code text not null unique default encode(gen_random_bytes(16), 'hex'),

  heure_commande timestamptz not null default now(),
  heure_souhaitee timestamptz,

  -- FLASH 1 : scan QR au départ cuisine.
  heure_depart_cuisine timestamptz,

  -- FLASH 2 : scan QR à la livraison chez le client.
  heure_livraison_effective timestamptz,

  statut text not null default 'en_attente' check (
    statut in ('en_attente', 'en_livraison', 'livre')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger livraisons_set_updated_at
  before update on livraisons
  for each row
  execute function set_updated_at();

create index if not exists livraisons_livreur_statut_idx on livraisons (livreur_id, statut);
create unique index if not exists livraisons_qr_code_idx on livraisons (qr_code);

comment on table livraisons is
  'Traçabilité complète : QR généré à la validation commande, flashé au départ '
  'cuisine (flash 1) puis à la livraison (flash 2). Alimente le dashboard patron '
  '(temps réel par livreur, écart vs heure souhaitée, cuisine vs trajet).';

alter table livraisons enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100700_finances.sql
-- ------------------------------------------------------------
-- Module 6 — Finances (accès patron uniquement).

create table if not exists charges_fixes (
  id uuid primary key default gen_random_uuid(),
  nom text not null, -- salaires, leasing, eau, électricité, loyer...
  montant numeric(10, 2) not null check (montant >= 0),
  frequence text not null default 'mensuelle' check (frequence in ('mensuelle', 'annuelle', 'ponctuelle')),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger charges_fixes_set_updated_at
  before update on charges_fixes
  for each row
  execute function set_updated_at();

comment on table charges_fixes is
  'Charges fixes saisies et modifiables uniquement par le patron.';

-- Paramètres globaux clé/valeur (seuils dashboard, etc.), modifiables patron uniquement.
create table if not exists parametres (
  cle text primary key,
  valeur jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger parametres_set_updated_at
  before update on parametres
  for each row
  execute function set_updated_at();

insert into parametres (cle, valeur, description) values
  ('seuil_ca_jour', '291', 'Seuil de CA journalier affiché sur le dashboard patron (barre de progression)'),
  ('objectif_ca_jour', '1000', 'Objectif de CA journalier après le seuil')
on conflict (cle) do nothing;

alter table charges_fixes enable row level security;
alter table parametres enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100800_factures_ocr.sql
-- ------------------------------------------------------------
-- Module 4 — Import factures fournisseur (OCR via API Anthropic).

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid references fournisseurs (id),
  fournisseur_nom_brut text, -- nom tel que lu par l'OCR avant rapprochement éventuel
  date_facturation date,

  fichier_url text, -- chemin dans Supabase Storage (photo/scan original)
  fichier_type text check (fichier_type in ('jpg', 'png', 'pdf')),

  statut text not null default 'en_attente_validation' check (
    statut in ('en_attente_validation', 'validee', 'rejetee')
  ),

  valide_par uuid references profils (id),
  valide_at timestamptz,

  created_at timestamptz not null default now()
);

create table if not exists facture_lignes (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures (id) on delete cascade,

  description text not null, -- texte brut extrait par l'OCR
  quantite numeric(10, 2),
  unite text,
  prix_unitaire numeric(10, 2),
  montant numeric(10, 2),

  -- Rapprochement effectué à la validation patron : quel article de stock,
  -- et quel lot a été créé à partir de cette ligne.
  article_stock_id uuid references articles_stock (id),
  lot_id uuid references lots (id),

  created_at timestamptz not null default now()
);

create index if not exists facture_lignes_facture_idx on facture_lignes (facture_id);

comment on table factures is
  'En-tête facture importée (photo ou fichier). Extraction OCR automatique, '
  'validation manuelle du patron avant création des lots (Module 4).';

comment on table facture_lignes is
  'Lignes extraites par OCR. Validées/corrigées par le patron avant de générer les lots.';

-- Maintenant que `factures` existe, on peut poser la contrainte FK sur lots.facture_id.
alter table lots
  add constraint lots_facture_id_fkey
  foreign key (facture_id) references factures (id);

alter table factures enable row level security;
alter table facture_lignes enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830100900_trigger_fidelite.sql
-- ------------------------------------------------------------
-- Logique métier d'accumulation de fidélité (Module 5), déclenchée quand une
-- commande passe au statut de paiement "paye".
--
-- Règles :
--  - Si la commande utilise une récompense (recompense_appliquee = true) :
--    le cycle du client est remis à zéro (montant_cumule = 0), et un mouvement
--    'recompense_utilisee' est journalisé.
--  - Sinon : le montant de la commande s'ajoute à montant_cumule, on ouvre le
--    cycle (date_premier_achat_cycle) si besoin et on recalcule l'expiration
--    à 3 mois. Si le seuil de 10 tampons (100€) est atteint, on passe
--    recompense_disponible à true et on journalise 'recompense_disponible'
--    (déclenchera l'email automatique via Resend côté Edge Function, cf. TODO).
--
-- NB : l'expiration automatique (email de rappel J-7, reset à J+3 mois) est
-- gérée par un job planifié (Supabase Edge Function + cron), pas par ce
-- trigger — voir supabase/functions/fidelite-expiration (à créer).
-- Notification envoyée par email (Resend), plus par SMS (cf. migration
-- 20260830101200_email_clients_notifications.sql).

create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_seuil_atteint boolean;
begin
  -- Ne rien faire si pas de client identifié, ou si le paiement n'est pas confirmé.
  if new.client_telephone is null or new.paiement_statut is distinct from 'paye' then
    return new;
  end if;

  -- Idempotence : ne traiter qu'une seule fois le passage à "paye"
  -- (si UPDATE et l'ancien statut était déjà 'paye', on ignore).
  if tg_op = 'UPDATE' and old.paiement_statut = 'paye' then
    return new;
  end if;

  -- S'assure que le client existe (création automatique — Module 1).
  insert into clients (telephone)
  values (new.client_telephone)
  on conflict (telephone) do nothing;

  if new.recompense_appliquee then
    update clients
    set montant_cumule = 0,
        recompense_disponible = false,
        date_premier_achat_cycle = null,
        date_expiration = null
    where telephone = new.client_telephone;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'recompense_utilisee', new.montant, new.id);
  else
    update clients
    set montant_cumule = montant_cumule + new.montant,
        date_premier_achat_cycle = coalesce(date_premier_achat_cycle, now()),
        date_expiration = coalesce(date_premier_achat_cycle, now()) + interval '3 months'
    where telephone = new.client_telephone
    returning (tampons_acquis >= 10) into v_seuil_atteint;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'accumulation', new.montant, new.id);

    if v_seuil_atteint then
      update clients
      set recompense_disponible = true
      where telephone = new.client_telephone
        and recompense_disponible = false;

      if found then
        insert into fidelite_mouvements (client_telephone, type, commande_id)
        values (new.client_telephone, 'recompense_disponible', new.id);
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger commandes_appliquer_fidelite
  after insert or update of paiement_statut on commandes
  for each row
  execute function appliquer_fidelite_sur_commande();

comment on function appliquer_fidelite_sur_commande() is
  'Accumulation/récompense fidélité déclenchée au passage paiement_statut = paye. '
  'Expiration à 3 mois gérée séparément par un job planifié (Edge Function).';


-- ------------------------------------------------------------
-- Fichier source : 20260830101000_vues_dashboard.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- Fichier source : 20260830101100_parametres_livraison.sql
-- ------------------------------------------------------------
-- Ajout au brief (2026-08-30) — Paramètres livraison, oubliés dans la V1.
-- Tout est modifiable par le patron en temps réel, sans intervention technique.

-- Paramètres livraison : table singleton (une seule ligne, id=true forcé).
create table if not exists parametres_livraison (
  id boolean primary key default true check (id),
  heure_debut time not null default '11:00',
  heure_fin time not null default '14:00',
  minimum_commande numeric(10, 2) not null default 8.00 check (minimum_commande >= 0),
  updated_at timestamptz not null default now()
);

create trigger parametres_livraison_set_updated_at
  before update on parametres_livraison
  for each row
  execute function set_updated_at();

insert into parametres_livraison (id) values (true)
on conflict (id) do nothing;

comment on table parametres_livraison is
  'Ligne unique de paramètres livraison : horaires (défaut 11h-14h) et minimum '
  'de commande (défaut 8€). Modifiable par le patron depuis le dashboard.';

-- Zones de livraison autorisées. Une seule commune au lancement (Dembéni),
-- mais table pensée pour en ajouter d'autres plus tard sans changement de schéma.
create table if not exists zones_livraison (
  id uuid primary key default gen_random_uuid(),
  commune text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

insert into zones_livraison (commune) values ('Dembéni')
on conflict (commune) do nothing;

comment on table zones_livraison is
  'Communes où la livraison est autorisée. commandes.zone_livraison (colonne '
  'existante, texte libre) doit être validée côté application contre cette liste.';

alter table parametres_livraison enable row level security;
alter table zones_livraison enable row level security;


-- ------------------------------------------------------------
-- Fichier source : 20260830101200_email_clients_notifications.sql
-- ------------------------------------------------------------
-- Ajout au brief (2026-08-30) — Recentrage des notifications.
-- Décision produit : Twilio est conservé UNIQUEMENT pour l'OTP du site
-- (vérification identité au moment de la commande en ligne — doit arriver
-- en quelques secondes, l'email ne convient pas pour ce cas d'usage précis).
--
-- Tous les autres SMS sont supprimés du système :
--   - SMS récompense fidélité disponible  → remplacé par email (Resend)
--   - SMS rappel J-7 avant expiration      → remplacé par email (Resend)
--   - SMS quotidien marketing (9h-10h)     → supprimé définitivement, pas de remplacement
--
-- Conséquence schéma : le consentement RGPD "SMS marketing" n'a plus de raison
-- d'être (plus aucun SMS marketing dans le système), et l'email devient une
-- donnée obligatoire collectée à la création de compte client (nécessaire pour
-- recevoir les notifications de fidélité).

alter table clients
  add column if not exists email text;

comment on column clients.email is
  'Email client, obligatoire à la création de compte (collecté en même temps '
  'que le téléphone). Utilisé pour les notifications de fidélité via Resend '
  '(récompense disponible, rappel J-7 avant expiration). Nullable au niveau '
  'base pour ne pas casser une éventuelle ligne existante sans email ; '
  'l''obligation est appliquée côté application au moment de la création du compte.';

-- Les anciens champs de consentement SMS marketing ne sont plus utilisés :
-- il ne reste plus aucun SMS marketing dans le système (uniquement l'OTP,
-- qui ne nécessite pas de consentement marketing RGPD).
alter table clients
  drop column if exists sms_optin,
  drop column if exists date_optin,
  drop column if exists sms_stop_at;

comment on table clients is
  'Table client partagée caisse + site + livreur. 1 tampon = 10€ cumulés. '
  'Récompense à 10 tampons (100€) = 10€ offerts, valable 3 mois, non fractionnable. '
  'Notifications de fidélité envoyées par email (Resend), pas par SMS.';

comment on table fidelite_mouvements is
  'Historique/audit des mouvements de fidélité. Sert aussi de source aux '
  'notifications email (Resend) déclenchées par Edge Function : '
  'recompense_disponible → email immédiat, expiration → email de rappel J-7.';

