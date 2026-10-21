-- Verrouille un tampon fidélité dès qu'une commande non payée a
-- "l'intention" de l'utiliser (tampons_utilises posé à la création), pour
-- qu'il ne puisse plus être compté comme disponible pour une AUTRE
-- commande pendant que la première attend son paiement. Jusqu'ici, le
-- vrai débit (utilise = true) n'avait lieu qu'au paiement confirmé — rien
-- n'empêchait donc le même tampon d'être proposé deux fois en même temps
-- à deux commandes différentes du même client. Repéré le 2026-10-21 sur
-- la commande #509 (encore "en attente", paiement en espèces à venir),
-- dont le tampon apparaissait toujours comme disponible ailleurs dans
-- l'app — demande explicite du patron : verrouiller jusqu'à validation du
-- paiement, libérer automatiquement si la commande est annulée avant.

alter table fidelite_tampons add column if not exists commande_reservation_id uuid references commandes (id);

comment on column fidelite_tampons.commande_reservation_id is
  'Commande non payée qui a réservé ce tampon (tampons_utilises posé à la création) — exclu de compterTamponsDisponibles tant que renseigné. Remis à null si la commande est annulée avant paiement ; finalisé (utilise=true, commande_utilisation_id) au paiement confirmé.';

create index if not exists fidelite_tampons_reservation_idx
  on fidelite_tampons (commande_reservation_id)
  where commande_reservation_id is not null;

-- Verrouille jusqu'à p_nombre tampons disponibles pour ce téléphone, au
-- profit de p_commande_id — appelée juste après la création d'une
-- commande qui demande des tampons (jamais avant : la commande doit
-- exister pour que la clé étrangère soit valide). `for update skip
-- locked` évite qu'une course entre deux commandes simultanées du même
-- client ne réserve deux fois le même tampon. Retourne le nombre
-- réellement verrouillé (peut être < p_nombre dans de très rares cas de
-- course ou d'expiration juste-à-temps) ; l'appelant doit annuler la
-- commande si c'est inférieur à ce qui était demandé.
create or replace function reserver_tampons_fidelite(p_telephone text, p_nombre integer, p_commande_id uuid)
returns integer
language plpgsql
as $$
declare
  v_reserves integer;
begin
  if p_nombre <= 0 then
    return 0;
  end if;

  with dispo as (
    select id from fidelite_tampons
    where client_telephone = p_telephone
      and not utilise
      and commande_reservation_id is null
      and date_expiration > now()
    order by date_expiration asc
    limit p_nombre
    for update skip locked
  )
  update fidelite_tampons
  set commande_reservation_id = p_commande_id
  where id in (select id from dispo);

  get diagnostics v_reserves = row_count;
  return v_reserves;
end;
$$;

comment on function reserver_tampons_fidelite(text, integer, uuid) is
  'Verrouille jusqu''à p_nombre tampons disponibles pour ce téléphone au profit de p_commande_id. Retourne le nombre réellement verrouillé.';

-- Réécriture du trigger fidélité : finalise en priorité les tampons déjà
-- réservés pour CETTE commande (plutôt qu'un FIFO générique qui pourrait
-- en finaliser un autre), et libère toute réservation encore en attente
-- dès qu'une commande est annulée, quel que soit son statut de paiement
-- (une commande annulée n'a jamais payé via ce chemin, la réservation
-- n'existe que tant que non payée — ce nouveau bloc est donc toujours le
-- bon endroit pour la libérer, avant même le bloc existant qui gère le cas
-- "déjà payée, sans tampon utilisé").
create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_net numeric(10, 2);
  v_reste numeric(10, 2);
  v_nouvelle_expiration timestamptz;
begin
  -- 1) Annulation : libère toute réservation de tampon pas encore payée
  -- sur cette commande, puis (cas déjà existant) reverse une commande qui
  -- avait déjà été payée sans tampon utilisé.
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    update fidelite_tampons set commande_reservation_id = null where commande_reservation_id = new.id;

    if new.client_telephone is not null and new.paiement_statut = 'paye' and new.tampons_utilises = 0 then
      delete from fidelite_tampons
      where commande_obtention_id = new.id and not utilise;

      update clients set montant_cumule = greatest(0, montant_cumule - new.montant)
      where telephone = new.client_telephone;

      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'annulation', -new.montant, new.id);
    end if;
    return new;
  end if;

  -- 2) Modification du montant d'une commande déjà payée, non annulée,
  -- sans tampon utilisé : ajuste le reliquat par le delta, et
  -- mint/retire des tampons si le delta franchit un seuil de 100€.
  if tg_op = 'UPDATE'
     and new.paiement_statut = 'paye' and old.paiement_statut = 'paye'
     and new.statut is distinct from 'annulee' and old.statut is distinct from 'annulee'
     and new.montant is distinct from old.montant
     and new.tampons_utilises = 0 and old.tampons_utilises = 0 then
    if new.client_telephone is not null then
      select montant_cumule into v_reste from clients where telephone = new.client_telephone;
      v_reste := greatest(0, coalesce(v_reste, 0) + (new.montant - old.montant));

      if new.montant < old.montant then
        delete from fidelite_tampons
        where id in (
          select id from fidelite_tampons
          where commande_obtention_id = new.id and not utilise
          order by date_obtention desc
          limit floor((old.montant - new.montant) / 100)::int
        );
      end if;

      if v_reste >= 100 then
        v_nouvelle_expiration := now() + interval '3 months';
        while v_reste >= 100 loop
          insert into fidelite_tampons (client_telephone, date_expiration, commande_obtention_id)
          values (new.client_telephone, v_nouvelle_expiration, new.id);
          v_reste := v_reste - 100;
        end loop;
      end if;

      update clients set montant_cumule = v_reste where telephone = new.client_telephone;

      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'modification', new.montant - old.montant, new.id);
    end if;
    return new;
  end if;

  -- 3) Passage initial à "paye" (idempotent).
  if new.client_telephone is null or new.paiement_statut is distinct from 'paye' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.paiement_statut = 'paye' then
    return new;
  end if;

  insert into clients (telephone) values (new.client_telephone) on conflict (telephone) do nothing;

  -- Consomme les tampons demandés : en priorité ceux déjà réservés pour
  -- CETTE commande (posés par reserver_tampons_fidelite à la création),
  -- puis en repli les plus proches de l'expiration parmi les non réservés
  -- (ne devrait normalement jamais être nécessaire, filet de sécurité
  -- seulement — ex: réservation jamais posée sur une très vieille
  -- commande d'avant cette migration).
  if new.tampons_utilises > 0 then
    update fidelite_tampons
    set utilise = true, commande_utilisation_id = new.id, commande_reservation_id = null
    where id in (
      select id from fidelite_tampons
      where client_telephone = new.client_telephone and not utilise and date_expiration > now()
        and (commande_reservation_id = new.id or commande_reservation_id is null)
      order by (commande_reservation_id = new.id) desc, date_expiration asc
      limit new.tampons_utilises
    );

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    select new.client_telephone, 'tampon_utilise', montant, new.id
    from fidelite_tampons
    where commande_utilisation_id = new.id;
  end if;

  v_net := greatest(0, new.montant - (new.tampons_utilises * 10));

  if v_net > 0 then
    select montant_cumule into v_reste from clients where telephone = new.client_telephone;
    v_reste := coalesce(v_reste, 0) + v_net;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'accumulation', v_net, new.id);

    if v_reste >= 100 then
      v_nouvelle_expiration := now() + interval '3 months';
      while v_reste >= 100 loop
        insert into fidelite_tampons (client_telephone, date_expiration, commande_obtention_id)
        values (new.client_telephone, v_nouvelle_expiration, new.id);
        v_reste := v_reste - 100;

        insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
        values (new.client_telephone, 'tampon_obtenu', 10, new.id);
      end loop;
    end if;

    update clients set montant_cumule = v_reste where telephone = new.client_telephone;
  end if;

  return new;
end;
$$;

comment on function appliquer_fidelite_sur_commande() is
  'Fidélité par tampons individuels de 10€, un tampon tous les 100€ cumulés. Déclenché au passage paiement_statut = paye (finalise en priorité les tampons réservés par reserver_tampons_fidelite), à l''annulation (libère toute réservation en attente) et à la modification du montant.';
