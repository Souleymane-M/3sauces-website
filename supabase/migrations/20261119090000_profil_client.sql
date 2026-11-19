-- Profil du client (étudiant, lycéen/collégien, enseignant ou personnel d'un établissement, salarié, autre) :
-- demandé une seule fois (site public pour tous, caisse pour les nouveaux clients) afin de cibler les e-mails et les offres.
alter table clients add column if not exists profil text;
alter table clients add column if not exists profil_renseigne_le timestamptz;

alter table clients drop constraint if exists clients_profil_check;
alter table clients add constraint clients_profil_check
  check (profil is null or profil in ('etudiant', 'lyceen_collegien', 'enseignant_personnel', 'salarie', 'autre'));

comment on column clients.profil is 'Profil déclaré par le client lui-même (jamais déduit de ses adresses de livraison).';
