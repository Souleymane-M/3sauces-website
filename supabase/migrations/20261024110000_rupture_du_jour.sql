-- Rupture rapide d'un produit, le temps du service — demande explicite du
-- patron, 2026-10-24 : les brochettes étaient finies mais le site
-- continuait d'en proposer, et personne en cuisine/caisse ne pouvait les
-- retirer sans passer par le catalogue complet (patron-only jusqu'ici, ou
-- l'onglet Produits complet désormais, mais encore trop lent en plein
-- coup de feu). `rupture_le` est une simple date : si elle vaut
-- AUJOURD'HUI, le produit est masqué partout (site public + caisse) ; tout
-- autre jour (ou null), il redevient disponible tout seul, sans action à
-- faire le lendemain. Distinct de `actif` (désactivation permanente,
-- gérée dans le catalogue complet) et de `stock_jour` (quantité limitée
-- suivie précisément par le patron).
alter table produits add column if not exists rupture_le date;

comment on column produits.rupture_le is
  'Si égal à la date du jour (fuseau Mayotte), le produit est masqué sur le site public et en caisse pour aujourd''hui uniquement — se réinitialise automatiquement le lendemain, aucune action manuelle requise.';
