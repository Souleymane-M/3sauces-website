-- Ajout au brief (2026-08-30) — Recentrage des notifications.
-- Décision produit : Twilio est conservé UNIQUEMENT pour l'OTP du site
-- (vérification identité au moment de la commande en ligne — doit arriver
-- en quelques secondes, l'email ne convient pas pour ce cas d'usage précis).
--
-- Tous les autres SMS sont supprimés du système :
--   - SMS récompense fidélité disponible  → remplacé par email (Resend)
--   - SMS rappel J-7 avant expiration      → remplacé par email (Resend)
--   - SMS quotidien marketing (9h-10h)     → supprimé définitivement, pas de remplacement
--
-- Conséquence schéma : le consentement RGPD "SMS marketing" n'a plus de raison
-- d'être (plus aucun SMS marketing dans le système), et l'email devient une
-- donnée obligatoire collectée à la création de compte client (nécessaire pour
-- recevoir les notifications de fidélité).

alter table clients
  add column if not exists email text;

comment on column clients.email is
  'Email client, obligatoire à la création de compte (collecté en même temps '
  'que le téléphone). Utilisé pour les notifications de fidélité via Resend '
  '(récompense disponible, rappel J-7 avant expiration). Nullable au niveau '
  'base pour ne pas casser une éventuelle ligne existante sans email ; '
  'l''obligation est appliquée côté application au moment de la création du compte.';

-- Les anciens champs de consentement SMS marketing ne sont plus utilisés :
-- il ne reste plus aucun SMS marketing dans le système (uniquement l'OTP,
-- qui ne nécessite pas de consentement marketing RGPD).
alter table clients
  drop column if exists sms_optin,
  drop column if exists date_optin,
  drop column if exists sms_stop_at;

comment on table clients is
  'Table client partagée caisse + site + livreur. 1 tampon = 10€ cumulés. '
  'Récompense à 10 tampons (100€) = 10€ offerts, valable 3 mois, non fractionnable. '
  'Notifications de fidélité envoyées par email (Resend), pas par SMS.';

comment on table fidelite_mouvements is
  'Historique/audit des mouvements de fidélité. Sert aussi de source aux '
  'notifications email (Resend) déclenchées par Edge Function : '
  'recompense_disponible → email immédiat, expiration → email de rappel J-7.';
