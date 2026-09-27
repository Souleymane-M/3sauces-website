-- Modification du contenu d'une commande (Module : "que faire si le client
-- veut modifier ?"). Comme l'annulation, volontairement limitée aux
-- commandes encore "en_attente", et jamais si une récompense fidélité a
-- déjà été consommée sur cette commande précise (exclu côté application —
-- trop risqué à reverser/réappliquer automatiquement). Le canal n'est
-- jamais modifiable ici (ça toucherait la logique de paiement/livraison
-- déjà en place) — pour changer de canal, on annule et on recrée.

-- 1. Nouveau type de mouvement fidélité pour l'ajustement (delta) d'une
-- commande déjà payée dont le montant change après modification.
alter table fidelite_mouvements drop constraint if exists fidelite_mouvements_type_check;
alter table fidelite_mouvements add constraint fidelite_mouvements_type_check
  check (type in ('accumulation', 'recompense_disponible', 'recompense_utilisee', 'expiration', 'annulation', 'modification'));

-- 2. Ajustement atomique du stock du jour lors d'une modification : restitue
-- les anciennes quantités puis décompte les nouvelles, dans la même
-- transaction (la fonction appelante annule tout si le stock est
-- insuffisant pour la nouvelle composition — jamais de stock à moitié
-- ajusté).
create or replace function ajuster_stocks_produits(anciens jsonb, nouveaux jsonb)
returns void as $$
begin
  perform incrementer_stocks_produits(anciens);
  perform decrementer_stocks_produits(nouveaux);
end;
$$ language plpgsql;

-- 3. Le trigger de fidélité doit aussi réagir à un changement de montant sur
-- une commande déjà payée (ni annulée, ni via une récompense déjà
-- consommée) : ajuste l'accumulation déjà créditée par la différence,
-- sans repartir de zéro.
create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_seuil_atteint boolean;
begin
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    if new.client_telephone is not null and new.paiement_statut = 'paye' and not new.recompense_appliquee then
      update clients
      set montant_cumule = greatest(0, montant_cumule - new.montant)
      where telephone = new.client_telephone;

      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'annulation', -new.montant, new.id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.paiement_statut = 'paye' and old.paiement_statut = 'paye'
     and new.statut is distinct from 'annulee' and old.statut is distinct from 'annulee'
     and new.montant is distinct from old.montant
     and not new.recompense_appliquee and not old.recompense_appliquee then
    if new.client_telephone is not null then
      update clients
      set montant_cumule = greatest(0, montant_cumule + (new.montant - old.montant))
      where telephone = new.client_telephone;

      insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
      values (new.client_telephone, 'modification', new.montant - old.montant, new.id);
    end if;
    return new;
  end if;

  -- Ne rien faire si pas de client identifié, ou si le paiement n'est pas confirmé.
  if new.client_telephone is null or new.paiement_statut is distinct from 'paye' then
    return new;
  end if;

  -- Idempotence : ne traiter qu'une seule fois le passage à "paye"
  -- (si UPDATE et l'ancien statut était déjà 'paye', on ignore).
  if tg_op = 'UPDATE' and old.paiement_statut = 'paye' then
    return new;
  end if;

  -- S'assure que le client existe (création automatique — Module 1).
  insert into clients (telephone)
  values (new.client_telephone)
  on conflict (telephone) do nothing;

  if new.recompense_appliquee then
    update clients
    set montant_cumule = 0,
        recompense_disponible = false,
        date_premier_achat_cycle = null,
        date_expiration = null
    where telephone = new.client_telephone;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'recompense_utilisee', new.montant, new.id);
  else
    update clients
    set montant_cumule = montant_cumule + new.montant,
        date_premier_achat_cycle = coalesce(date_premier_achat_cycle, now()),
        date_expiration = coalesce(date_premier_achat_cycle, now()) + interval '3 months'
    where telephone = new.client_telephone
    returning (tampons_acquis >= 10) into v_seuil_atteint;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'accumulation', new.montant, new.id);

    if v_seuil_atteint then
      update clients
      set recompense_disponible = true
      where telephone = new.client_telephone
        and recompense_disponible = false;

      if found then
        insert into fidelite_mouvements (client_telephone, type, commande_id)
        values (new.client_telephone, 'recompense_disponible', new.id);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists commandes_appliquer_fidelite on commandes;
create trigger commandes_appliquer_fidelite
  after insert or update of paiement_statut, statut, montant on commandes
  for each row
  execute function appliquer_fidelite_sur_commande();

comment on function appliquer_fidelite_sur_commande() is
  'Accumulation/récompense fidélité déclenchée au passage paiement_statut = paye, '
  'reversée si la commande est annulée après coup, et ajustée par la différence si son '
  'montant change après modification (sauf récompense déjà consommée dans ces deux cas). '
  'Expiration à 3 mois gérée séparément par un job planifié (Edge Function).';
