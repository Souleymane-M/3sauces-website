-- Points de fidélité DOUBLÉS les jours d'opération (clients actifs, site seulement) : on double les POINTS gagnés, pas les euros.
-- Exemple : 15 € payés = 1 point de fidélité normalement -> 2 ; 30 € payés = 3 points -> 6.
-- Une commande marquée `points_doubles`, une fois payée, reçoit en plus autant de points que ce qu'elle a déjà rapporté
-- (chaque point = 10 € de compteur). Le trigger fidélité d'origine n'est pas modifié. Annulation : le bonus est retiré.
alter table commandes add column if not exists points_doubles boolean not null default false;
alter table commandes add column if not exists bonus_fidelite numeric(10, 2) not null default 0;

create or replace function appliquer_bonus_points_doubles()
returns trigger
language plpgsql
as $$
declare
  v_net numeric(10, 2);
  v_apres numeric(10, 2);
  v_total numeric(10, 2);
  v_avant numeric(10, 2);
  v_recompenses integer;
  v_points integer;
  v_bonus numeric(10, 2);
  v_reste numeric(10, 2);
  v_expiration timestamptz;
begin
  if new.points_doubles is not true or new.client_telephone is null then
    return new;
  end if;

  -- Annulation : retire le bonus déjà crédité.
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    if new.bonus_fidelite > 0 then
      update clients set montant_cumule = greatest(0, montant_cumule - new.bonus_fidelite) where telephone = new.client_telephone;
      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'annulation', -new.bonus_fidelite, new.id);
    end if;
    return new;
  end if;

  -- Passage initial à « payé » uniquement (idempotent).
  if new.paiement_statut is distinct from 'paye' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.paiement_statut = 'paye' then
    return new;
  end if;

  v_net := greatest(0, new.montant);
  if v_net <= 0 then
    return new;
  end if;

  -- Le crédit normal vient d'être fait par le trigger d'origine : on retrouve combien de points cette commande a rapportés.
  select montant_cumule into v_apres from clients where telephone = new.client_telephone;
  v_apres := coalesce(v_apres, 0);
  select count(*) into v_recompenses from fidelite_tampons where commande_obtention_id = new.id;
  v_total := v_apres + 100 * v_recompenses;
  v_avant := v_total - v_net;
  v_points := floor(v_total / 10)::int - floor(v_avant / 10)::int;
  if v_points <= 0 then
    return new;
  end if;

  -- Bonus = autant de points que ce que la commande a déjà rapporté (10 € de compteur par point).
  v_bonus := v_points * 10;
  v_reste := v_apres + v_bonus;

  insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
  values (new.client_telephone, 'modification', v_bonus, new.id);

  if v_reste >= 100 then
    v_expiration := now() + interval '3 months';
    while v_reste >= 100 loop
      insert into fidelite_tampons (client_telephone, date_expiration, commande_obtention_id)
      values (new.client_telephone, v_expiration, new.id);
      v_reste := v_reste - 100;
      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'tampon_obtenu', 10, new.id);
    end loop;
  end if;

  update clients set montant_cumule = v_reste where telephone = new.client_telephone;
  update commandes set bonus_fidelite = v_bonus where id = new.id;
  return new;
end;
$$;

-- Nom alphabétiquement APRÈS « commandes_appliquer_fidelite » : le crédit normal passe d'abord, le bonus ensuite.
drop trigger if exists commandes_bonus_points_doubles on commandes;
create trigger commandes_bonus_points_doubles
  after insert or update of paiement_statut, statut, montant on commandes
  for each row execute function appliquer_bonus_points_doubles();
