-- Terminaux SumUp Solo jumelés (Cloud API) — demande explicite du patron,
-- 2026-10-24 : rendre les paiements CB au comptoir 100% fiables (un
-- paiement SumUp = une commande précise, jamais de rapprochement
-- approximatif par montant/heure). `reader_id` est l'identifiant renvoyé
-- par SumUp lors du jumelage ("rdr_..."), utilisé ensuite pour envoyer un
-- ordre de paiement à CE boîtier précis via l'API.
create table if not exists terminaux_sumup (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  reader_id text not null unique,
  created_at timestamptz not null default now()
);

comment on table terminaux_sumup is
  'Boîtiers SumUp Solo jumelés avec le compte marchand, gérés depuis /patron. Le Solo Lite (livraison) ne peut pas être jumelé ici — il fonctionne en Bluetooth avec un téléphone, pas via la Cloud API.';
comment on column terminaux_sumup.reader_id is
  'Identifiant SumUp du lecteur ("rdr_..."), renvoyé lors du jumelage — utilisé pour cibler ce boîtier précis dans les appels Cloud API.';
