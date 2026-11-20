-- Points de fidélité doublés les jours d'opération (clients actifs, site et caisse) : sans toucher au trigger existant.
-- Une commande marquée `points_doubles` reçoit, quand elle est payée, un SECOND crédit identique (même montant net) :
-- 10 € payés = 2 points au lieu de 1. Annulation : le bonus est retiré. Le trigger fidélité d'origine n'est pas modifié.
alter table commandes add column if not exists points_doubles boolean not null default false;

create or replace function appliquer_bonus_points_doubles()
returns trigger
language plpgsql
as $$
declare
  v_net numeric(10, 2);
  v_reste numeric(10, 2);
  v_expiration timestamptz;
begin
  if new.points_doubles is not true or new.client_telephone is null then
    return new;
  end if;

  -- Annulation : retire le bonus déjà crédité (la même règle que le trigger d'origine : seulement si payée sans récompense utilisée).
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    if new.paiement_statut = 'paye' and new.tampons_utilises = 0 then
      update clients set montant_cumule = greatest(0, montant_cumule - new.montant) where telephone = new.client_telephone;
      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'annulation', -new.montant, new.id);
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

  select montant_cumule into v_reste from clients where telephone = new.client_telephone;
  v_reste := coalesce(v_reste, 0) + v_net;

  insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
  values (new.client_telephone, 'accumulation', v_net, new.id);

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
  return new;
end;
$$;

-- Nom alphabétiquement APRÈS « commandes_appliquer_fidelite » : le crédit normal passe d'abord, le bonus ensuite.
drop trigger if exists commandes_bonus_points_doubles on commandes;
create trigger commandes_bonus_points_doubles
  after insert or update of paiement_statut, statut, montant on commandes
  for each row execute function appliquer_bonus_points_doubles();
