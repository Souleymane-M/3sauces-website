-- Permet de choisir, par commande, d'imprimer ou non le ticket client
-- physique (reçu) depuis la caisse — demande explicite du patron. Le bon
-- de cuisine n'est jamais concerné : il reste toujours imprimé, quel que
-- soit ce champ. Défaut à true pour ne rien changer au comportement
-- existant (y compris pour les commandes du site public, qui n'exposent
-- jamais ce choix).

alter table commandes add column if not exists imprimer_ticket_client boolean not null default true;

comment on column commandes.imprimer_ticket_client is
  'Si faux, le ticket client (reçu) n''est jamais envoyé à l''impression pour cette commande — le bon de cuisine, lui, s''imprime toujours. Choix fait en caisse au moment de l''encaissement.';
