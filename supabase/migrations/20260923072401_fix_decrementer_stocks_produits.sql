-- Correction de decrementer_stocks_produits (20260923062143) : `returning
-- true into trouve` mettait `trouve` à NULL (jamais à false) quand l'UPDATE
-- ne touchait aucune ligne — `if not trouve` avec trouve=NULL est indéterminé
-- en SQL, donc l'exception n'était jamais levée et le stock insuffisant
-- passait silencieusement. Remplacé par la variable spéciale `FOUND`,
-- fiable après un UPDATE (true si au moins une ligne a été modifiée).
create or replace function decrementer_stocks_produits(items jsonb)
returns void as $$
declare
  item jsonb;
  ligne_produit_id uuid;
  quantite integer;
begin
  for item in select * from jsonb_array_elements(items) loop
    ligne_produit_id := (item->>'produitId')::uuid;
    quantite := (item->>'quantite')::integer;

    update produits
    set stock_jour = stock_jour - quantite
    where id = ligne_produit_id and stock_jour is not null and stock_jour >= quantite;

    if not found then
      raise exception 'STOCK_INSUFFISANT:%', ligne_produit_id;
    end if;
  end loop;
end;
$$ language plpgsql;
