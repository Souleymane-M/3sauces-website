-- Plats du jour au choix "salade OU boisson" (demande du patron, 2026-10-26) :
-- le client choisit l'un des deux, inclus dans le prix. Champ par produit,
-- activable pour d'autres plats plus tard (meme principe que salade_incluse).
alter table produits
  add column if not exists salade_ou_boisson boolean not null default false;

update produits
  set salade_ou_boisson = true,
      description = '+ accompagnement + salade ou boisson'
  where nom = 'Poisson grillé';
