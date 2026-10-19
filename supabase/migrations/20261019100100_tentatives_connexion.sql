-- Anti-bruteforce PIN/mot de passe persistant : l'ancien compteur en
-- mémoire du process (`rate-limit.ts`) ne tient pas la charge sur Vercel
-- (serverless, instances multiples, redémarrages fréquents) — corrigé ici
-- par un compteur partagé en base, clé libre (appareil ou IP selon l'appel).
create table if not exists tentatives_connexion (
  cle text primary key,
  tentatives integer not null default 0,
  reinitialise_a timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table tentatives_connexion enable row level security;

create trigger tentatives_connexion_set_updated_at
  before update on tentatives_connexion
  for each row
  execute function set_updated_at();

comment on table tentatives_connexion is
  'Compteur anti-bruteforce PIN/mot de passe, partagé entre toutes les '
  'instances serverless. Clé libre : "appareil:<id>" ou "ip:<adresse>" '
  'selon le plafond appliqué (cf. src/lib/auth/rate-limit-db.ts).';
