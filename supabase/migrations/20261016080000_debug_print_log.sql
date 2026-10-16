-- Table de diagnostic temporaire (2e fois, cf. 20261013034000) pour
-- comprendre pourquoi l'imprimante confirme parfois un succès sans
-- réellement imprimer (commandes #357/#358 du 2026-10-15, jamais sorties
-- sur papier malgré ticket_imprime_le renseigné). À supprimer une fois le
-- problème diagnostiqué.
create table if not exists debug_print_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  connection_type text,
  commande_numero integer,
  corps text
);
alter table debug_print_log enable row level security;
