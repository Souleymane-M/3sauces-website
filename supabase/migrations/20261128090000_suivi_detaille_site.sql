-- Suivi détaillé et anonyme du site public (demande du patron, 2026-11-27) : d'où viennent les visiteurs, sur quel appareil,
-- ce qu'ils cliquent et combien de temps ils restent sur chaque étape ou produit.
-- Aucune donnée personnelle : même identifiant aléatoire que `visiteurs_site` (un par onglet), jamais de nom, téléphone, email, adresse ni IP.
-- Seules des CATÉGORIES sont gardées (ex. « android / telephone / chrome »), jamais l'identifiant brut du navigateur.
-- Les lignes de plus de 90 jours sont effacées par `purger_suivi_site()` (appelée chaque jour par la tâche automatique).

-- 1) Une ligne par visite : provenance + appareil.
create table if not exists visites_site (
  visiteur uuid primary key,
  date_jour date not null,
  premiere_vue timestamptz not null default now(),
  source text check (source is null or char_length(source) <= 40),          -- étiquette ?src= (email-…, whatsapp-…, affiche…)
  referent text check (referent is null or char_length(referent) <= 80),    -- site d'origine (domaine seulement), null = accès direct
  page_arrivee text check (page_arrivee is null or char_length(page_arrivee) <= 80),
  appareil text check (appareil in ('telephone', 'tablette', 'ordinateur')),
  systeme text check (systeme in ('android', 'ios', 'windows', 'macos', 'linux', 'autre')),
  navigateur text check (navigateur in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'instagram', 'facebook', 'tiktok', 'autre')),
  a_commande boolean not null default false
);
create index if not exists visites_site_jour_idx on visites_site (date_jour, source);

-- 2) Clics, produits regardés et temps passé.
create table if not exists clics_site (
  id bigint generated always as identity primary key,
  visiteur uuid not null,
  date_jour date not null,
  created_at timestamptz not null default now(),
  type text not null check (type in ('clic', 'produit_vu', 'temps_etape', 'temps_produit')),
  cible text not null check (char_length(cible) <= 80),   -- ex. « visuel-offre », « bouton-commander », nom du produit, étape
  duree_ms integer check (duree_ms is null or (duree_ms >= 0 and duree_ms <= 1800000))
);
create index if not exists clics_site_jour_idx on clics_site (date_jour, type, cible);

alter table visites_site enable row level security;
alter table clics_site enable row level security;

-- 3) Effacement automatique après 90 jours.
create or replace function purger_suivi_site()
returns void
language sql
as $$
  delete from clics_site where date_jour < (now() + interval '3 hours')::date - 90;
  delete from visites_site where date_jour < (now() + interval '3 hours')::date - 90;
$$;
