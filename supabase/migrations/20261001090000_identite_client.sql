-- Vraie fiche client : nom/prénom en plus du téléphone, et un moyen sûr de
-- corriger un numéro mal saisi (la clé primaire `clients.telephone` est
-- référencée par `commandes.client_telephone` et
-- `fidelite_mouvements.client_telephone`, sans ON UPDATE CASCADE — un simple
-- update de la PK casserait ces deux tables).

alter table clients add column if not exists nom text;
alter table clients add column if not exists prenom text;

-- Les FK ci-dessous sont vérifiées par défaut à chaque instruction (pas
-- seulement à la fin de la transaction) : `corriger_telephone_client`
-- doit renommer la PK `clients.telephone` ET les deux colonnes qui la
-- référencent dans la même transaction, quel que soit l'ordre des
-- updates — on les rend donc DEFERRABLE INITIALLY DEFERRED (vérification
-- repoussée au COMMIT), sans rien changer à leur comportement habituel.
alter table commandes alter constraint commandes_client_telephone_fkey deferrable initially deferred;
alter table fidelite_mouvements alter constraint fidelite_mouvements_client_telephone_fkey deferrable initially deferred;

-- Stockage structuré du prénom (le `nom_livraison` existant continue de
-- recevoir "Prénom Nom" concaténé pour ne rien changer aux tickets/écrans
-- cuisine-livreur qui le lisent déjà).
alter table commandes add column if not exists prenom text;

comment on column clients.nom is 'Identité du client, écrite directement par le code applicatif à chaque commande (pas de calcul, pas de trigger).';
comment on column clients.prenom is 'Idem clients.nom.';

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
  update clients set telephone = nouveau where telephone = ancien;
end;
$$;

comment on function corriger_telephone_client(text, text) is
  'Corrige un numéro de téléphone client mal saisi : déplace ses commandes et son historique fidélité vers le nouveau numéro, puis renomme la fiche. Rejette si le nouveau numéro est déjà pris par un autre client (pas de fusion automatique).';
