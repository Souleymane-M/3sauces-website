-- Annulation d'une commande (Module : "que faire si le client veut
-- annuler ?"). Volontairement limitée aux commandes encore "en_attente"
-- (vérifié côté application, pas ici) : au-delà, la préparation a
-- commencé, ça se gère de vive voix avec la cuisine, pas depuis un écran.

-- 1. Nouveau statut "annulee" accepté par les deux tables concernées.
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in ('en_attente', 'en_preparation', 'pret', 'remis_au_client', 'pris_par_livreur', 'livre', 'annulee'));

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'commandes_evenements'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%statut%';

  if v_constraint_name is not null then
    execute format('alter table commandes_evenements drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table commandes_evenements add constraint commandes_evenements_statut_check
  check (statut in ('en_preparation', 'pret', 'remis_au_client', 'pris_par_livreur', 'livre', 'annulee'));

-- 2. Motif optionnel saisi par qui annule (employé, livreur ou patron).
alter table commandes add column if not exists motif_annulation text null;

-- 3. Restitution du stock du jour déjà décompté à la commande (symétrique
-- de decrementer_stocks_produits) — jamais bloquant : un produit sans
-- stock_jour suivi (null) est simplement ignoré par le where.
create or replace function incrementer_stocks_produits(items jsonb)
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
    set stock_jour = stock_jour + quantite
    where id = ligne_produit_id and stock_jour is not null;
  end loop;
end;
$$ language plpgsql;

-- 4. Nouveau type de mouvement fidélité pour journaliser une reversion.
alter table fidelite_mouvements drop constraint if exists fidelite_mouvements_type_check;
alter table fidelite_mouvements add constraint fidelite_mouvements_type_check
  check (type in ('accumulation', 'recompense_disponible', 'recompense_utilisee', 'expiration', 'annulation'));

-- 5. Le trigger de fidélité doit aussi réagir à l'annulation d'une commande
-- déjà payée, pour reverser l'accumulation déjà créditée. Volontairement
-- PAS géré ici : une commande dont la récompense a déjà été consommée
-- (recompense_appliquee = true) — reverser correctement demanderait de
-- retrouver le solde exact d'avant sa consommation, trop risqué en
-- automatique ; à corriger à la main si ce cas se présente (rare).
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
  after insert or update of paiement_statut, statut on commandes
  for each row
  execute function appliquer_fidelite_sur_commande();

comment on function appliquer_fidelite_sur_commande() is
  'Accumulation/récompense fidélité déclenchée au passage paiement_statut = paye, '
  'et reversée si la commande est annulée après coup (sauf récompense déjà consommée). '
  'Expiration à 3 mois gérée séparément par un job planifié (Edge Function).';
