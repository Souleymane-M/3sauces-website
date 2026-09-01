-- Logique métier d'accumulation de fidélité (Module 5), déclenchée quand une
-- commande passe au statut de paiement "paye".
--
-- Règles :
--  - Si la commande utilise une récompense (recompense_appliquee = true) :
--    le cycle du client est remis à zéro (montant_cumule = 0), et un mouvement
--    'recompense_utilisee' est journalisé.
--  - Sinon : le montant de la commande s'ajoute à montant_cumule, on ouvre le
--    cycle (date_premier_achat_cycle) si besoin et on recalcule l'expiration
--    à 3 mois. Si le seuil de 10 tampons (100€) est atteint, on passe
--    recompense_disponible à true et on journalise 'recompense_disponible'
--    (déclenchera l'email automatique via Resend côté Edge Function, cf. TODO).
--
-- NB : l'expiration automatique (email de rappel J-7, reset à J+3 mois) est
-- gérée par un job planifié (Supabase Edge Function + cron), pas par ce
-- trigger — voir supabase/functions/fidelite-expiration (à créer).
-- Notification envoyée par email (Resend), plus par SMS (cf. migration
-- 20260830101200_email_clients_notifications.sql).

create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_seuil_atteint boolean;
begin
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

create trigger commandes_appliquer_fidelite
  after insert or update of paiement_statut on commandes
  for each row
  execute function appliquer_fidelite_sur_commande();

comment on function appliquer_fidelite_sur_commande() is
  'Accumulation/récompense fidélité déclenchée au passage paiement_statut = paye. '
  'Expiration à 3 mois gérée séparément par un job planifié (Edge Function).';
