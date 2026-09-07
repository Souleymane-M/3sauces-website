-- Impression thermique (Epson TM-m30, ePOS-Print) : deux imprimantes fixes
-- configurables depuis /patron (adresse IP jamais codee en dur), plus un
-- numero de commande lisible pour le ticket (aujourd'hui seul un uuid brut
-- existe sur `commandes`).

-- Deux lignes fixes, pas une liste a rallonge : comptoir (ticket client) et
-- cuisine (bon de preparation). `adresse_ip` reste NULL tant que le patron
-- ne l'a pas renseignee ; l'impression reste desactivee jusque-la, sans
-- bloquer les commandes (cf. code applicatif).
create table if not exists imprimantes (
  id uuid primary key default gen_random_uuid(),
  role text not null unique check (role in ('comptoir', 'cuisine')),
  nom text not null,
  adresse_ip text,
  port integer not null default 8043,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger imprimantes_set_updated_at
  before update on imprimantes
  for each row
  execute function set_updated_at();

insert into imprimantes (role, nom) values
  ('comptoir', 'Imprimante comptoir'),
  ('cuisine', 'Imprimante cuisine')
on conflict (role) do nothing;

alter table imprimantes enable row level security;

comment on table imprimantes is
  'Configuration reseau des 2 imprimantes thermiques (comptoir/cuisine), '
  'modifiable uniquement depuis /patron. adresse_ip NULL = non configuree.';

-- Numero de commande sequentiel et lisible ("Commande #482") pour le
-- ticket/bon imprime. Ajout sur une table de production avec des commandes
-- deja existantes : chaque etape est un no-op si rejouee deux fois.
create sequence if not exists commandes_numero_seq;

alter table commandes add column if not exists numero integer;

-- Numerote uniquement les lignes encore sans numero, dans l'ordre
-- chronologique reel (created_at) plutot qu'un ordre arbitraire.
with ordonnees as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from commandes
  where numero is null
)
update commandes c set numero = o.rn
from ordonnees o
where c.id = o.id;

-- Aligne la sequence sur le prochain numero libre, quel que soit l'etat de
-- la table (vide, partiellement remplie, ou deja migree une premiere fois).
select setval('commandes_numero_seq', coalesce((select max(numero) from commandes), 0) + 1, false);

alter table commandes alter column numero set default nextval('commandes_numero_seq');
alter table commandes alter column numero set not null;
alter sequence commandes_numero_seq owned by commandes.numero;

create unique index if not exists commandes_numero_idx on commandes (numero);
