-- Recalcule le solde fidélité de TOUS les clients à partir de la seule
-- source jamais corrompue par aucun bug : la somme réelle de leurs
-- commandes payées (`commandes.montant` où `paiement_statut = 'paye'`).
--
-- La correction du 2026-10-07 précédente (20261007090000) s'appuyait sur
-- les tampons déjà en base, eux-mêmes faussés par deux choses : (1)
-- l'approximation de la toute première migration (20261006090000) pour les
-- clients déjà existants, (2) le bug du seuil à 10€ au lieu de 100€ pendant
-- les ~24h où le trigger buggé a tourné. Résultat : des clients ayant
-- vraiment dépensé (ex: Mouna, ~76€) se sont retrouvés à 0 tampon alors
-- qu'ils n'avaient simplement pas encore atteint 100€ — correct dans ce
-- cas précis, mais invérifiable sans repartir de la vraie source.
--
-- Règle (confirmée explicitement par le patron) : 1€ dépensé = 1 tampon
-- de progression. 100€ cumulés (= 10 tampons) débloquent 1 récompense de
-- 10€, stockée comme une ligne `fidelite_tampons` individuellement datée
-- et expirable. Les récompenses déjà UTILISÉES (`utilise = true`) ne sont
-- jamais touchées ici — c'est de l'argent réellement donné sur des
-- commandes déjà payées, impossible de revenir dessus techniquement —
-- mais elles comptent en déduction du nombre de récompenses à vie
-- auxquelles le client a droit, pour ne pas lui en recréditer en double.
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
    where client_telephone = c.telephone and paiement_statut = 'paye';

    select count(*) into v_recompenses_consommees
    from fidelite_tampons
    where client_telephone = c.telephone and utilise = true;

    v_recompenses_a_vie := floor(v_total_paye / 100)::int;
    v_recompenses_disponibles := greatest(0, v_recompenses_a_vie - v_recompenses_consommees);
    v_nouveau_reliquat := v_total_paye - (v_recompenses_a_vie * 100);

    -- Garde la date d'expiration la plus proche déjà affichée au client,
    -- quand il en avait une, plutôt que de repartir à 3 mois pleins.
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
