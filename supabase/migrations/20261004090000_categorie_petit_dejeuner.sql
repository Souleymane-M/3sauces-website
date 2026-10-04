-- Nouvelle catégorie de produits "petit_dejeuner" — visible uniquement sur
-- /caisse pour le moment (le filtrage par écran se fait côté application,
-- cf. commande-publique-app.tsx qui ne construit pas de section pour cette
-- catégorie), pas de changement de ce côté en base.

alter table produits drop constraint produits_categorie_check;
alter table produits add constraint produits_categorie_check
  check (categorie in ('menu_special', 'snacking', 'grillade', 'boisson', 'supplement', 'accompagnement', 'plat_du_jour', 'petit_dejeuner'));
