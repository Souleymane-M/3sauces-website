-- Refonte fidélité : chaque tranche de 10€ devient un tampon individuel,
-- avec sa propre date d'obtention et sa propre expiration à 3 mois — plus
-- un seul compteur/booléen par client remis à zéro d'un coup. Le client
-- peut cumuler sans limite et dépenser ses tampons par tranche de 10€,
-- consommés du plus ancien au plus proche de l'expiration (FIFO).
--
-- Important : une commande qui utilise N tampons ne doit faire gagner de
-- nouveaux tampons que sur le montant réellement payé en plus (montant -
-- N*10), jamais sur le montant brut — sinon utiliser une récompense sur
-- une commande plus grosse ferait gagner plus que ce qui a été dépensé.
--
-- Aucun job planifié introduit ici : un tampon "disponible" se définit en
-- lecture (`not utilise and date_expiration > now()`), pas besoin de rien
-- exécuter en arrière-plan pour le faire "expirer".

create table fidelite_tampons (
  id uuid primary key default gen_random_uuid(),
  client_telephone text not null references clients (telephone) on delete cascade deferrable initially deferred,
  montant numeric(10, 2) not null default 10,
  date_obtention timestamptz not null default now(),
  date_expiration timestamptz not null,
  utilise boolean not null default false,
  commande_obtention_id uuid references commandes (id),
  commande_utilisation_id uuid references commandes (id)
);

create index fidelite_tampons_client_idx on fidelite_tampons (client_telephone, utilise, date_expiration);

alter table fidelite_tampons enable row level security;

comment on table fidelite_tampons is
  'Un tampon = 10€ de récompense, individuellement daté et expirable (3 mois depuis son obtention). '
  'Disponible = not utilise and date_expiration > now(), calculé à la lecture, jamais par un job planifié.';

-- Migration des données existantes : convertit le cumul "tout ou rien" de
-- chaque client en tampons individuels, AVANT de supprimer les colonnes
-- qui portent encore l'information utile ici (recompense_disponible,
-- date_expiration, date_premier_achat_cycle). Approximation assumée
-- (aucun historique par tampon n'existait avant cette migration) : date
-- d'obtention = date de premier achat du cycle en cours (ou maintenant si
-- absente), expiration = l'ancienne date d'expiration si une récompense
-- était déjà disponible, sinon 3 mois depuis l'obtention approximée.
do $$
declare
  c record;
  v_whole integer;
  v_reste numeric(10, 2);
  v_obtention timestamptz;
  v_expiration timestamptz;
  i integer;
begin
  for c in
    select telephone, montant_cumule, recompense_disponible, date_premier_achat_cycle, date_expiration
    from clients
    where montant_cumule > 0
  loop
    v_whole := floor(c.montant_cumule / 10)::int;
    v_reste := c.montant_cumule - (v_whole * 10);

    if v_whole > 0 then
      v_obtention := coalesce(c.date_premier_achat_cycle, now());
      v_expiration := case
        when c.recompense_disponible and c.date_expiration is not null then c.date_expiration
        else v_obtention + interval '3 months'
      end;
      for i in 1..v_whole loop
        insert into fidelite_tampons (client_telephone, date_obtention, date_expiration)
        values (c.telephone, v_obtention, v_expiration);
      end loop;
    end if;

    update clients set montant_cumule = v_reste where telephone = c.telephone;
  end loop;
end;
$$;

-- `clients.montant_cumule` change de sens : ne contient plus le cumul
-- total, seulement le reliquat (< 10€) pas encore converti en tampon.
-- `tampons_acquis`/`recompense_disponible`/`date_premier_achat_cycle`/
-- `date_expiration` n'ont plus aucun lecteur après cette migration.
alter table clients drop column tampons_acquis;
alter table clients drop column recompense_disponible;
alter table clients drop column date_premier_achat_cycle;
alter table clients drop column date_expiration;

comment on column clients.montant_cumule is
  'Reliquat (< 10€) pas encore converti en tampon — plus le cumul total. Voir fidelite_tampons pour les tampons eux-mêmes.';

-- `commandes.recompense_appliquee` (tout ou rien) devient un compte : le
-- nombre de tampons effectivement demandés sur cette commande. L'intention
-- est posée ici à la commande ; la sélection FIFO réelle des tampons et
-- leur marquage comme utilisés restent différés au trigger, au moment où
-- le paiement est réellement confirmé (même principe que l'ancien booléen).
alter table commandes add column tampons_utilises integer not null default 0 check (tampons_utilises >= 0);
update commandes set tampons_utilises = 1 where recompense_appliquee = true;
alter table commandes drop column recompense_appliquee;

comment on column commandes.tampons_utilises is
  'Nombre de tampons fidélité demandés sur cette commande — revérifié et effectivement consommés (FIFO) par le trigger au paiement confirmé.';

-- `fidelite_mouvements.type` : remplace les deux valeurs liées à l'ancien
-- système "tout ou rien" par les équivalents par-tampon. Les lignes
-- existantes doivent être converties AVANT d'ajouter la nouvelle
-- contrainte, sinon elle rejette les anciennes valeurs encore en base.
alter table fidelite_mouvements drop constraint fidelite_mouvements_type_check;
update fidelite_mouvements set type = 'tampon_obtenu' where type = 'recompense_disponible';
update fidelite_mouvements set type = 'tampon_utilise' where type = 'recompense_utilisee';
alter table fidelite_mouvements add constraint fidelite_mouvements_type_check
  check (type in ('accumulation', 'tampon_obtenu', 'tampon_utilise', 'expiration', 'annulation', 'modification'));

-- `corriger_telephone_client` doit aussi déplacer les tampons d'un client
-- dont le numéro est corrigé.
create or replace function corriger_telephone_client(ancien text, nouveau text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from clients where telephone = ancien) then
    raise exception 'Aucun client avec le numéro %', ancien;
  end if;

  if exists (select 1 from clients where telephone = nouveau) then
    raise exception 'Le numéro % appartient déjà à un autre client', nouveau;
  end if;

  update commandes set client_telephone = nouveau where client_telephone = ancien;
  update fidelite_mouvements set client_telephone = nouveau where client_telephone = ancien;
  update fidelite_tampons set client_telephone = nouveau where client_telephone = ancien;
  update clients set telephone = nouveau where telephone = ancien;
end;
$$;

comment on function corriger_telephone_client(text, text) is
  'Corrige un numéro de téléphone client mal saisi : déplace ses commandes, son historique fidélité et ses tampons vers le nouveau numéro, puis renomme la fiche. Rejette si le nouveau numéro est déjà pris par un autre client (pas de fusion automatique).';

-- Réécriture complète du trigger de fidélité pour les tampons individuels.
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
  -- mint/retire des tampons si le delta franchit un seuil de 10€.
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
          limit floor((old.montant - new.montant) / 10)::int
        );
      end if;

      if v_reste >= 10 then
        v_nouvelle_expiration := now() + interval '3 months';
        while v_reste >= 10 loop
          insert into fidelite_tampons (client_telephone, date_expiration, commande_obtention_id)
          values (new.client_telephone, v_nouvelle_expiration, new.id);
          v_reste := v_reste - 10;
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

    if v_reste >= 10 then
      v_nouvelle_expiration := now() + interval '3 months';
      while v_reste >= 10 loop
        insert into fidelite_tampons (client_telephone, date_expiration, commande_obtention_id)
        values (new.client_telephone, v_nouvelle_expiration, new.id);
        v_reste := v_reste - 10;

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
  'Fidélité par tampons individuels de 10€ (date d''obtention/expiration propres, FIFO à la consommation), déclenchée au passage paiement_statut = paye, à l''annulation et à la modification du montant. Expiration calculée à la lecture (date_expiration > now()), aucun job planifié.';
