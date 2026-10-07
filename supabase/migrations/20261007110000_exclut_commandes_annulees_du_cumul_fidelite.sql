-- Corrige un oubli de la recomputation du 2026-10-07
-- (20261007100000_recalcule_fidelite_depuis_commandes.sql) : elle sommait
-- toutes les commandes `paiement_statut = 'paye'`, sans exclure celles
-- ensuite annulées (`statut = 'annulee'`) — une commande annulée reste
-- marquée "payée" si elle avait déjà été encaissée avant l'annulation,
-- mais ne doit jamais compter dans le cumul fidélité du client. Repéré par
-- le patron le 2026-10-07 sur son propre compte test (3 commandes de test
-- annulées, 62€, créditées à tort).
do $$
declare
  c record;
  v_total_paye numeric(10, 2);
  v_recompenses_a_vie integer;
  v_recompenses_consommees integer;
  v_recompenses_disponibles integer;
  v_nouveau_reliquat numeric(10, 2);
  v_expiration timestamptz;
  i integer;
begin
  for c in select telephone from clients
  loop
    select coalesce(sum(montant), 0) into v_total_paye
    from commandes
    where client_telephone = c.telephone and paiement_statut = 'paye' and statut != 'annulee';

    select count(*) into v_recompenses_consommees
    from fidelite_tampons
    where client_telephone = c.telephone and utilise = true;

    v_recompenses_a_vie := floor(v_total_paye / 100)::int;
    v_recompenses_disponibles := greatest(0, v_recompenses_a_vie - v_recompenses_consommees);
    v_nouveau_reliquat := v_total_paye - (v_recompenses_a_vie * 100);

    select min(date_expiration) into v_expiration
    from fidelite_tampons
    where client_telephone = c.telephone and not utilise and date_expiration > now();

    delete from fidelite_tampons
    where client_telephone = c.telephone and not utilise and date_expiration > now();

    if v_recompenses_disponibles > 0 then
      if v_expiration is null then
        v_expiration := now() + interval '3 months';
      end if;
      for i in 1..v_recompenses_disponibles loop
        insert into fidelite_tampons (client_telephone, date_expiration)
        values (c.telephone, v_expiration);
      end loop;
    end if;

    update clients set montant_cumule = v_nouveau_reliquat where telephone = c.telephone;
  end loop;
end;
$$;
