-- Filet de sécurité (revue de sécurité du 2026-09-02, avant mise en prod) :
-- aucune table de `public` n'a de Row Level Security activée. Aujourd'hui
-- rien dans le code de l'app n'utilise la clé anon Supabase pour lire/écrire
-- ces tables (tout passe par des routes API serveur avec la clé service_role,
-- qui ignore toujours RLS — donc cette migration ne change rien au
-- fonctionnement actuel de l'app).
--
-- Mais sans RLS, la clé anon publique (NEXT_PUBLIC_SUPABASE_ANON_KEY,
-- exposée au navigateur) donnerait un accès en lecture/écriture total et non
-- filtré à `commandes`/`clients` (données personnelles clients) à quiconque
-- l'extrait du bundle JS, en contournant complètement l'API et son
-- rate-limiting. On active RLS sans créer de policy : par défaut, ça
-- refuse tout accès aux rôles `anon`/`authenticated`, seul `service_role`
-- (utilisé uniquement côté serveur) continue de tout voir.
--
-- Si un jour un composant client a besoin de lire Supabase directement
-- (ex: Realtime), il faudra ajouter des policies explicites et ciblées à
-- ce moment-là plutôt que de repartir d'un accès total.

alter table if exists public.articles_stock enable row level security;
alter table if exists public.charges_fixes enable row level security;
alter table if exists public.clients enable row level security;
alter table if exists public.commandes enable row level security;
alter table if exists public.facture_lignes enable row level security;
alter table if exists public.factures enable row level security;
alter table if exists public.fidelite_mouvements enable row level security;
alter table if exists public.fournisseurs enable row level security;
alter table if exists public.livraisons enable row level security;
alter table if exists public.lot_mouvements enable row level security;
alter table if exists public.lots enable row level security;
alter table if exists public.paiements enable row level security;
alter table if exists public.parametres enable row level security;
alter table if exists public.parametres_livraison enable row level security;
alter table if exists public.produits enable row level security;
alter table if exists public.profils enable row level security;
alter table if exists public.sessions_table enable row level security;
alter table if exists public.tables enable row level security;
alter table if exists public.viandes enable row level security;
alter table if exists public.zones_livraison enable row level security;
