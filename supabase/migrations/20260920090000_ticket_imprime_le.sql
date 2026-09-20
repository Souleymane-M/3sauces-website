-- Trace du moment où le ticket d'une commande a été effectivement imprimé
-- (uniquement utilisé pour les commandes à l'avance, cf. lib/caisse/
-- nouvelles-commandes.ts) : rend l'impression différée idempotente à
-- travers les cycles de polling et les rechargements de page, contrairement
-- au dédoublonnage actuel (Set en localStorage, propre à un seul appareil).
alter table commandes
  add column if not exists ticket_imprime_le timestamptz null;
