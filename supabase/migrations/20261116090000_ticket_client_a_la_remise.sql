-- Ticket client imprimé seulement à la remise de la commande (demande du patron, 2026-11-15) : pour une commande du
-- site ou du téléphone (sur place / à emporter), le bon de cuisine part tout de suite ; le ticket client, lui, s'imprime
-- quand le client vient la récupérer et que le vrai mode de paiement est enregistré. Cette colonne demande à
-- l'imprimante de n'imprimer que le ticket client (le bon de cuisine est déjà sorti), puis redevient fausse.
alter table commandes add column if not exists ticket_client_seul boolean not null default false;
