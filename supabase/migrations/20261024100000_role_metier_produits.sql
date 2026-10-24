-- Nouveau rôle métier "produits" : gérer le catalogue (ajouter/supprimer
-- un produit, limiter son stock du jour, le marquer en rupture) — demande
-- explicite du patron, 2026-10-24, volontairement DISTINCT de "patron"
-- (Pilotage), qui donne aussi accès aux statistiques et à la gestion des
-- comptes employés. Un cuisinier de confiance peut ainsi gérer les plats
-- du jour sans jamais voir le chiffre d'affaires ni pouvoir désactiver un
-- collègue — attribué/retiré par le patron depuis Équipe → Pilotage →
-- Utilisateurs, comme les autres rôles métier.

alter table profil_roles drop constraint if exists profil_roles_role_metier_check;
alter table profil_roles add constraint profil_roles_role_metier_check
  check (role_metier in ('cuisine', 'comptoir', 'livreur', 'patron', 'produits'));

alter table commandes_evenements drop constraint if exists commandes_evenements_role_metier_check;
alter table commandes_evenements add constraint commandes_evenements_role_metier_check
  check (role_metier is null or role_metier in ('cuisine', 'comptoir', 'livreur', 'patron', 'produits'));
