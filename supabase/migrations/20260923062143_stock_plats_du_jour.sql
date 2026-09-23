-- Stock du jour, saisi manuellement chaque matin par le patron sur
-- /patron (pas de remise à zéro automatique). NULL = illimité (tous
-- les produits aujourd'hui), un nombre = quantité restante,
-- décrémentée à chaque commande (site public + caisse, stock physique
-- partagé) jusqu'à 0 où le produit devient impossible à commander.
alter table produits add column if not exists stock_jour integer null;

-- Décrément atomique multi-produits en une seule transaction : soit
-- tous les produits demandés ont assez de stock et sont décrémentés
-- ensemble, soit aucun ne l'est (jamais de décrément partiel). Lève
-- une exception nommant le produit en rupture, récupérée côté
-- application pour un message clair.
create or replace function decrementer_stocks_produits(items jsonb)
returns void as $$
declare
  item jsonb;
  ligne_produit_id uuid;
  quantite integer;
  trouve boolean;
begin
  for item in select * from jsonb_array_elements(items) loop
    ligne_produit_id := (item->>'produitId')::uuid;
    quantite := (item->>'quantite')::integer;

    update produits
    set stock_jour = stock_jour - quantite
    where id = ligne_produit_id and stock_jour is not null and stock_jour >= quantite
    returning true into trouve;

    if not trouve then
      raise exception 'STOCK_INSUFFISANT:%', ligne_produit_id;
    end if;
  end loop;
end;
$$ language plpgsql;
