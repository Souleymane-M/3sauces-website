-- Un ticket "remis" à l'imprimante (Server Direct Print) n'est pas encore
-- forcément imprimé (bourrage, imprimante occupée) : avant cette colonne,
-- on marquait `ticket_imprime_le` dès l'envoi, donc un échec silencieux
-- de l'imprimante ne se rattrapait jamais tout seul (vécu le 2026-10-12,
-- commande #303 jamais réellement sortie malgré le flag posé). Distinct
-- de `ticket_imprime_le` : "remis" = en attente de confirmation,
-- "imprime" = confirmé par la réponse de l'imprimante (SetResponse).
alter table commandes
  add column if not exists ticket_remis_le timestamptz;

comment on column commandes.ticket_remis_le is
  'Dernier envoi du ticket à l''imprimante (Server Direct Print), en attente de confirmation — null ou trop ancien (2 min) = re-proposé au prochain sondage.';
