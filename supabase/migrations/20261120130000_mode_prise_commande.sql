-- Comment une commande saisie en caisse est arrivée : au comptoir (client présent) ou par téléphone. Vide pour une commande du site.
alter table commandes add column if not exists mode_prise text;
alter table commandes drop constraint if exists commandes_mode_prise_check;
alter table commandes add constraint commandes_mode_prise_check check (mode_prise is null or mode_prise in ('comptoir', 'telephone'));
comment on column commandes.mode_prise is 'Saisie en caisse : comptoir (client présent) ou telephone. Null pour une commande passée sur le site.';
