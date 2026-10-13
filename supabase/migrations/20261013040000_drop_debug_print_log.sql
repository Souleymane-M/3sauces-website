-- Table de diagnostic temporaire (20261013034000_debug_print_log.sql) :
-- a servi à identifier la vraie cause des échecs d'impression Server
-- Direct Print (Version 2.00 incompatible avec le micrologiciel de
-- l'imprimante, cf. commit du 2026-10-13) — plus nécessaire une fois le
-- correctif confirmé en conditions réelles.
drop table if exists debug_print_log;
