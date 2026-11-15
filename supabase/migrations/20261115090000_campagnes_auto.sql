-- Campagnes d'e-mails automatiques du lundi, du mercredi et du vendredi (demande du patron, 2026-11-15).
-- Une ligne par jour de semaine (1 = lundi … 7 = dimanche) ; le patron règle texte, cible et interrupteur dans /patron.
-- Un déclencheur planifié (cron) du site lit cette table chaque matin. Lecture/écriture par le serveur uniquement.
create table if not exists campagnes_auto (
  jour_semaine int primary key check (jour_semaine between 1 and 7),
  actif boolean not null default false,
  mode text not null default 'points' check (mode in ('points', 'recompense', 'relance', 'tous')),
  jours_inactivite int not null default 14 check (jours_inactivite between 1 and 365),
  sujet text not null default '',
  message text not null default '',
  etiquette text not null default '',
  dernier_envoi_le date,
  dernier_nb_envoyes int,
  dernier_nb_echecs int,
  updated_at timestamptz not null default now()
);

-- Journal : un client n'est jamais écrit deux fois le même jour, même si le déclencheur repasse (reprise après une coupure).
create table if not exists campagnes_auto_envois (
  jour date not null,
  email text not null,
  envoye_le timestamptz not null default now(),
  primary key (jour, email)
);

alter table campagnes_auto enable row level security;
alter table campagnes_auto_envois enable row level security;

insert into campagnes_auto (jour_semaine, actif, mode, sujet, message, etiquette)
values
  (1, false, 'points', 'Bon début de semaine chez 3 Sauces',
   E'Bonjour {prenom},\n\nOn espère que ton week-end s''est bien passé. Pour bien démarrer la semaine, une bonne nouvelle : {pointsfidelite}.\n\nSur 3sauces.fr, saisis ton numéro et ton e-mail en haut du panier : tu retrouves tes points et tu choisis quand les utiliser.\n\nBonne semaine !',
   'lundi-points'),
  (3, false, 'tous', '', '', 'mercredi'),
  (5, false, 'tous', '', '', 'vendredi')
on conflict (jour_semaine) do nothing;
