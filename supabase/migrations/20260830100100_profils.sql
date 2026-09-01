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
