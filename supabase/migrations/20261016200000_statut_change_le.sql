-- Horodatage du dernier changement de statut d'une commande — pour le
-- minuteur par étape de l'écran cuisine (alerte si une commande dépasse
-- 15 minutes dans son statut actuel, remis à zéro à chaque transition).
alter table commandes add column if not exists statut_change_le timestamptz;
