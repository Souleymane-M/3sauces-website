-- Suivi de l'envoi des emails de confirmation du compte fidélité. Le 26/11/2026, le quota quotidien d'envoi (200 emails) a été
-- atteint après la campagne du matin : les emails de confirmation suivants n'ont pas été envoyés, sans qu'aucune trace ne le montre.
-- `envoye_le` : date d'envoi réussi (null = pas encore parti, renvoyé automatiquement) ; `derniere_erreur` : dernière erreur d'envoi.
alter table confirmations_email add column if not exists envoye_le timestamptz;
alter table confirmations_email add column if not exists derniere_erreur text;

-- Liens créés avant l'envoi de la campagne du 26/11 (04 h 37 UTC) : considérés comme bien envoyés. Les suivants (quota atteint) seront renvoyés.
update confirmations_email set envoye_le = created_at where envoye_le is null and created_at < '2026-11-26T04:37:00Z';
