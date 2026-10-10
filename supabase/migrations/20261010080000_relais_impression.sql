-- Blocage CORS confirmé le 2026-10-08/09 : les imprimantes Epson TM-m30III
-- ne renvoient jamais Access-Control-Allow-Origin sur leur service
-- ePOS-Print, et n'offrent aucun réglage pour l'activer (vérifié
-- exhaustivement dans tous les onglets de leur Web Config). Un site public
-- (3sauces.fr) ne peut donc jamais leur parler directement en HTTPS depuis
-- un navigateur — ni le certificat accepté, ni aucun contournement
-- client-only (no-cors : la requête part bien, mais l'imprimante ignore
-- silencieusement un Content-Type non conforme) ne résout ça.
--
-- Solution : un petit relais (cf. scripts/relais-impression/) tourne sur un
-- ordinateur du réseau local du restaurant, reçoit la requête du navigateur
-- (lui répond avec les bons en-têtes CORS, ce qu'on contrôle), et la
-- retransmet lui-même à l'imprimante en requête serveur-à-serveur — jamais
-- soumise aux restrictions CORS du navigateur.
--
-- `relais_url` reste NULL tant que rien n'est configuré : l'impression
-- retombe alors sur l'ancien comportement direct (no-cors, souvent
-- silencieusement sans effet avec ces imprimantes, mais jamais bloquant
-- pour la commande elle-même).
alter table imprimantes add column if not exists relais_url text;

comment on column imprimantes.relais_url is
  'Adresse du petit relais local (ex: https://192.168.x.x:8099) qui contourne le blocage CORS des imprimantes Epson — NULL = impression directe (souvent sans effet avec ces imprimantes, cf. scripts/relais-impression/).';
