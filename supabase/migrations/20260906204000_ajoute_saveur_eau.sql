-- Ajoute "Eau" comme choix possible pour la canette incluse des formules
-- (Tacos/Barquette/Bowl/Menu Etudiant) et pour la Canette 33cl autonome,
-- pour le client qui ne veut pas de soda.
insert into saveurs (nom) values ('Eau')
on conflict (nom) do nothing;
