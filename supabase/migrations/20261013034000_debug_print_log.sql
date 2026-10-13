-- Table de diagnostic temporaire pour comprendre pourquoi l'imprimante ne
-- confirme jamais l'impression via Server Direct Print (symptôme du
-- 2026-10-13 : commande #307 remise à l'imprimante en boucle, jamais
-- confirmée, imprimante elle-même sans erreur visible). À supprimer une
-- fois le problème diagnostiqué.
create table if not exists debug_print_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  connection_type text,
  corps text
);
alter table debug_print_log enable row level security;
