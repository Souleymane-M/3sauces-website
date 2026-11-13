-- Origine d'une commande du site : étiquette de la campagne dont vient le client (lien `?src=...` placé dans un
-- e-mail, un message WhatsApp, un flyer…), demande du patron 2026-11-13. Texte libre court, nul pour les commandes
-- sans étiquette (accès direct, caisse). Jamais bloquant : le site enregistre la commande même si cette colonne manque.
alter table commandes add column if not exists source_campagne text;
