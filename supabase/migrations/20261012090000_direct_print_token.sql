-- Jeton "Server Direct Print" Epson : permet à l'imprimante d'interroger
-- elle-même /api/print/epson/<jeton> pour demander son travail, sans
-- dépendre d'un relais local toujours allumé. N'importe quelle ligne
-- imprimantes peut le porter (la route renvoie toujours les deux tickets
-- ensemble, comme le fait déjà le relais pour un seul appareil physique).
alter table imprimantes
  add column if not exists direct_print_token text unique;

comment on column imprimantes.direct_print_token is
  'Jeton pour Epson Server Direct Print (l''imprimante interroge /api/print/epson/<jeton>) — null = fonctionnalité inactive pour cette ligne.';
