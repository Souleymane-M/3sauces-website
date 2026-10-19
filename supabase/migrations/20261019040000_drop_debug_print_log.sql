-- Table de diagnostic temporaire (20261016080000_debug_print_log.sql),
-- recréée après le premier retrait pour comprendre pourquoi #357/#358
-- s'étaient marquées imprimées sans sortir sur papier — plus nécessaire,
-- la cause a été trouvée et corrigée, et le circuit d'impression Server
-- Direct Print est confirmé fiable en conditions réelles (2026-10-19).
drop table if exists debug_print_log;
