-- Corrige le calcul de date_expiration : la CGU fidélité (page publique
-- /fidelite) promet "3 mois à partir de l'obtention de la récompense",
-- mais le trigger actuel calcule l'expiration dès le premier achat du
-- cycle. Un client qui met plusieurs mois à cumuler 100€ se retrouverait
-- avec une récompense déjà expirée au moment même où elle se débloque.
--
-- Nouveau comportement : date_expiration n'est posée qu'au moment où
-- recompense_disponible passe à true (+3 mois à partir de cet instant).
-- Le cumul partiel n'expire donc plus jamais tant que la récompense n'est
-- pas débloquée — seule la récompense débloquée expire.

create or replace function appliquer_fidelite_sur_commande()
returns trigger
language plpgsql
as $$
declare
  v_seuil_atteint boolean;
begin
  if new.client_telephone is null or new.paiement_statut is distinct from 'paye' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.paiement_statut = 'paye' then
    return new;
  end if;

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
        date_premier_achat_cycle = coalesce(date_premier_achat_cycle, now())
    where telephone = new.client_telephone
    returning (tampons_acquis >= 10) into v_seuil_atteint;

    insert into fidelite_mouvements (client_telephone, type, montant, commande_id)
    values (new.client_telephone, 'accumulation', new.montant, new.id);

    if v_seuil_atteint then
      update clients
      set recompense_disponible = true,
          date_expiration = now() + interval '3 months'
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

comment on function appliquer_fidelite_sur_commande() is
  'Accumulation/récompense fidélité déclenchée au passage paiement_statut = paye. '
  'date_expiration posée uniquement au déblocage de la récompense (+3 mois). '
  'Expiration/reset automatique gérés séparément par un job planifié (chantier futur).';

-- Backfill : corrige les lignes déjà en base pour refléter la nouvelle règle.
update clients c
set date_expiration = coalesce(
  (
    select fm.created_at + interval '3 months'
    from fidelite_mouvements fm
    where fm.client_telephone = c.telephone
      and fm.type = 'recompense_disponible'
    order by fm.created_at desc
    limit 1
  ),
  now() + interval '3 months'
)
where c.recompense_disponible = true;

update clients
set date_expiration = null
where recompense_disponible = false;
