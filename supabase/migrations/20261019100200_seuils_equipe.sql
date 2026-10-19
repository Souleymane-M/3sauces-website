-- Seuils du chantier "interface équipe unifiée", paramétrables depuis le
-- Pilotage (section 6 du cahier des charges) sans repasser par un
-- développeur. Réutilise la table générique `parametres` (cle/valeur
-- jsonb) déjà en place pour seuil_ca_jour/objectif_ca_jour.
insert into parametres (cle, valeur, description) values
  ('delai_preparation_standard_min', '15', 'Délai de préparation standard utilisé pour démarrer le chronomètre d''une commande à heure souhaitée (départ = heure souhaitée - ce délai)'),
  ('seuil_alerte_retard_etape_min', '15', 'Minutes dans la même étape (en attente/en préparation/prête) avant l''alerte visuelle en cuisine et au comptoir'),
  ('seuil_retard_2e_livreur_min', '35', 'Retard moyen hebdomadaire (minutes) au-delà duquel le Pilotage signale le seuil d''un 2e livreur'),
  ('duree_verrouillage_appareil_sec', '45', 'Durée d''inactivité avant verrouillage automatique d''une session appareil (tablette cuisine/comptoir)'),
  ('seuil_tentatives_appareil_partage', '20', 'Nombre d''échecs de PIN consécutifs tolérés par appareil partagé (cuisine/comptoir) avant blocage temporaire'),
  ('seuil_tentatives_appareil_livreur', '5', 'Nombre d''échecs de PIN consécutifs tolérés par appareil livreur avant blocage temporaire'),
  ('seuil_tentatives_ip_horaire', '30', 'Plafond global d''échecs de connexion par adresse IP et par heure, filet de sécurité si l''identifiant d''appareil est changé à chaque essai')
on conflict (cle) do nothing;
