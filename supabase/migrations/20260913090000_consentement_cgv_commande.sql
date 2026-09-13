-- Preuve RGPD : horodatage du consentement CGV/politique de confidentialité
-- au moment de la commande publique. Null pour les commandes antérieures à
-- cette mise en place (pas de rétro-consentement possible).
alter table commandes
  add column if not exists consentement_cgv_le timestamptz;
