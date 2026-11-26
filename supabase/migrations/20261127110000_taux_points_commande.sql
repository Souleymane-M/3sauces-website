-- Taux de points de fidélité par commande : `taux_points` = part du montant payé qui compte pour les points (1 = normal, 0,5 = moitié).
-- Offre canette offerte : 20 € payés = 1 point de fidélité, donc taux 0,5 (le compteur de euros ne reçoit que la moitié du montant).
-- Les commandes existantes gardent 1 : aucun changement pour elles. `sans_points` (menu étudiant offert) reste prioritaire.
-- Le reliquat se cumule d'une commande à l'autre : 10 € + 10 € à taux 0,5 donnent bien 1 point.
alter table commandes add column if not exists taux_points numeric(4, 2) not null default 1 check (taux_points >= 0 and taux_points <= 1);

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

    if new.client_telephone is not null and new.paiement_statut = 'paye' and new.tampons_utilises = 0 and not new.sans_points then
      delete from fidelite_tampons
      where commande_obtention_id = new.id and not utilise;

      update clients set montant_cumule = greatest(0, montant_cumule - round(new.montant * new.taux_points, 2))
      where telephone = new.client_telephone;

      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'annulation', -round(new.montant * new.taux_points, 2), new.id);
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
     and new.tampons_utilises = 0 and old.tampons_utilises = 0 and not new.sans_points then
    if new.client_telephone is not null then
      select montant_cumule into v_reste from clients where telephone = new.client_telephone;
      v_reste := greatest(0, coalesce(v_reste, 0) + round((new.montant - old.montant) * new.taux_points, 2));

      if new.montant < old.montant then
        delete from fidelite_tampons
        where id in (
          select id from fidelite_tampons
          where commande_obtention_id = new.id and not utilise
          order by date_obtention desc
          limit floor(((old.montant - new.montant) * new.taux_points) / 100)::int
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
      values (new.client_telephone, 'modification', round((new.montant - old.montant) * new.taux_points, 2), new.id);
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

  -- `commandes.montant` est DÉJÀ le montant réellement payé (après les points utilisés) : on ne soustrait pas une seconde fois
  -- la valeur des points (bug corrigé le 2026-11-20 : un client qui utilisait 10 € de points perdait 10 € de crédit de fidélité).
  -- Offre spéciale (`sans_points`) : rien n'est crédité. Offre canette : `taux_points` = 0,5 (moitié du montant compte).
  v_net := case when new.sans_points then 0 else round(greatest(0, new.montant) * new.taux_points, 2) end;

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
