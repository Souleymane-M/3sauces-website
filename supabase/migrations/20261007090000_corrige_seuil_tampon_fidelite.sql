-- URGENT — corrige une erreur grave de la migration de la veille
-- (20261006090000_tampons_fidelite.sql) : la règle du programme a toujours
-- été "10€ dépensés = 1 tampon. 10 tampons = 10€ offerts" (donc 100€
-- dépensés pour une récompense de 10€) — le trigger réécrit hier minait
-- par erreur un tampon redeemable à 10€ CHACUN tous les 10€ dépensés,
-- soit 10x trop généreux. Repéré le 2026-10-07 après qu'une cliente ait
-- pu utiliser 40€ de "récompense" sur une seule commande.
--
-- Cette migration : (1) corrige le trigger pour qu'un tampon ne se forme
-- plus que tous les 100€ (10 tampons de progression), (2) recalcule les
-- tampons encore disponibles (non utilisés) de chaque client selon la
-- bonne règle. Les tampons déjà UTILISÉS restent inchangés — c'est de
-- l'argent déjà donné sur des commandes déjà payées, impossible et faux
-- de revenir dessus techniquement ; à gérer manuellement si besoin.

-- 1) Recalcule les tampons disponibles de chaque client. La règle
-- correcte : le nombre de tampons "bruts" déjà formés (un par 10€,
-- c'est ce que la table contenait hier) plus le reliquat (< 10€) donnent
-- le vrai montant cumulé ; on reforme ensuite des tampons corrects à
-- 100€ pièce (= 10€ de récompense) à partir de ce total.
do $$
declare
  c record;
  v_total_euros numeric(10, 2);
  v_nb_recompenses integer;
  v_nouveau_reliquat numeric(10, 2);
  v_expiration timestamptz;
  i integer;
begin
  for c in
    select
      cl.telephone,
      cl.montant_cumule as reliquat_actuel,
      coalesce(count(ft.id), 0) as nb_tampons_bruts,
      min(ft.date_expiration) as expiration_la_plus_proche
    from clients cl
    left join fidelite_tampons ft
      on ft.client_telephone = cl.telephone and not ft.utilise and ft.date_expiration > now()
    group by cl.telephone, cl.montant_cumule
    having coalesce(count(ft.id), 0) > 0 or cl.montant_cumule > 0
  loop
    -- Supprime les tampons disponibles mal calculés d'hier (jamais ceux
    -- déjà utilisés, cf. commentaire plus haut).
    delete from fidelite_tampons
    where client_telephone = c.telephone and not utilise and date_expiration > now();

    v_total_euros := (c.nb_tampons_bruts * 10) + coalesce(c.reliquat_actuel, 0);
    v_nb_recompenses := floor(v_total_euros / 100)::int;
    v_nouveau_reliquat := v_total_euros - (v_nb_recompenses * 100);

    if v_nb_recompenses > 0 then
      -- Garde la date d'expiration la plus proche déjà affichée au client
      -- plutôt que de repartir à 3 mois pleins — jamais lui faire perdre
      -- ce qu'il pensait déjà avoir de disponible.
      v_expiration := coalesce(c.expiration_la_plus_proche, now() + interval '3 months');
      for i in 1..v_nb_recompenses loop
        insert into fidelite_tampons (client_telephone, date_expiration)
        values (c.telephone, v_expiration);
      end loop;
    end if;

    update clients set montant_cumule = v_nouveau_reliquat where telephone = c.telephone;
  end loop;
end;
$$;

-- 2) Corrige le trigger : un tampon (= 10€ de récompense) ne se forme
-- plus que tous les 100€ cumulés (10 tampons de progression), jamais
-- tous les 10€.
create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_net numeric(10, 2);
  v_reste numeric(10, 2);
  v_nouvelle_expiration timestamptz;
begin
  -- 1) Annulation d'une commande déjà payée, sans tampon utilisé : retire
  -- les tampons pas encore utilisés qu'elle avait fait gagner, et reverse
  -- approximativement son reliquat (imprécis sur quelques euros au pire,
  -- jamais sur un vrai tampon).
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut is distinct from 'annulee' then
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
  -- mint/retire des tampons si le delta franchit un seuil de 100€ (10€
  -- de récompense = 100€ cumulés, jamais 10€).
  if tg_op = 'UPDATE'
     and new.paiement_statut = 'paye' and old.paiement_statut = 'paye'
     and new.statut is distinct from 'annulee' and old.statut is distinct from 'annulee'
     and new.montant is distinct from old.montant
     and new.tampons_utilises = 0 and old.tampons_utilises = 0 then
    if new.client_telephone is not null then
      select montant_cumule into v_reste from clients where telephone = new.client_telephone;
      v_reste := greatest(0, coalesce(v_reste, 0) + (new.montant - old.montant));

      if new.montant < old.montant then
        -- Commande réduite : retire en priorité les tampons pas encore
        -- utilisés qu'elle avait fait gagner, le reliquat encaisse le reste.
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

  -- Consomme les tampons demandés, les plus proches de l'expiration
  -- d'abord (FIFO) — jamais bloquant si moins de tampons sont encore
  -- disponibles que demandé (rare : expirés entre la commande et le
  -- paiement), on consomme simplement ce qui reste.
  if new.tampons_utilises > 0 then
    update fidelite_tampons
    set utilise = true, commande_utilisation_id = new.id
    where id in (
      select id from fidelite_tampons
      where client_telephone = new.client_telephone and not utilise and date_expiration > now()
      order by date_expiration asc
      limit new.tampons_utilises
    );

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    select new.client_telephone, 'tampon_utilise', montant, new.id
    from fidelite_tampons
    where commande_utilisation_id = new.id;
  end if;

  -- Seul le montant réellement payé au-delà des tampons utilisés compte
  -- pour gagner de nouveaux tampons (jamais le montant brut : sinon une
  -- commande de 20€ payée avec 1 tampon de 10€ ferait gagner 2 tampons
  -- au lieu d'1).
  v_net := greatest(0, new.montant - (new.tampons_utilises * 10));

  if v_net > 0 then
    select montant_cumule into v_reste from clients where telephone = new.client_telephone;
    v_reste := coalesce(v_reste, 0) + v_net;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'accumulation', v_net, new.id);

    -- Un tampon (= 10€ de récompense) tous les 100€ cumulés, jamais tous
    -- les 10€ — c'est tout le bug corrigé par cette migration.
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
  'Fidélité par tampons individuels de 10€ (date d''obtention/expiration propres, FIFO à la consommation) : un tampon se forme tous les 100€ cumulés (10 tampons de progression), déclenché au passage paiement_statut = paye, à l''annulation et à la modification du montant. Expiration calculée à la lecture (date_expiration > now()), aucun job planifié.';
