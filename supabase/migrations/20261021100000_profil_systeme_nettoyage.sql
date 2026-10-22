-- Profil technique utilisé UNIQUEMENT pour attribuer les annulations
-- automatiques de commandes Stripe abandonnées (webhook
-- checkout.session.expired, cf. app/api/webhooks/stripe/route.ts) — la
-- table commandes_evenements exige un profil_id non nul, il faut donc une
-- identité à rattacher à une action déclenchée par le système, pas par un
-- humain. Jamais destiné à se connecter réellement : le PIN est un hash
-- d'une chaîne aléatoire jamais communiquée à personne.
insert into profils (nom, role, pin_hash, actif)
select 'Système (nettoyage automatique)', 'employe', crypt(gen_random_uuid()::text, gen_salt('bf')), true
where not exists (select 1 from profils where nom = 'Système (nettoyage automatique)');
