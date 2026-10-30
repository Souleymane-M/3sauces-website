-- Historique de disponibilite des produits (demande du patron, 2026-10-30) :
-- savoir quels produits etaient indisponibles et quand (brochettes, bananes...),
-- pour ne plus confondre "pas de vente parce qu'il n'y en avait pas" avec
-- "les clients n'en veulent plus". Alimente par un trigger : tout changement
-- (ecran /patron, caisse, API, SQL) est enregistre, sans toucher au code.
create table if not exists produits_historique_dispo (
  id bigint generated always as identity primary key,
  produit_id uuid not null references produits (id) on delete cascade,
  produit_nom text not null,
  evenement text not null check (
    evenement in ('active', 'desactive', 'epuise', 'reapprovisionne', 'etat_initial_actif', 'etat_initial_inactif')
  ),
  created_at timestamptz not null default now()
);

create index if not exists produits_historique_dispo_produit_idx
  on produits_historique_dispo (produit_id, created_at);
create index if not exists produits_historique_dispo_date_idx
  on produits_historique_dispo (created_at);

alter table produits_historique_dispo enable row level security;

create or replace function enregistrer_dispo_produit() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actif is distinct from old.actif then
    insert into produits_historique_dispo (produit_id, produit_nom, evenement)
    values (new.id, new.nom, case when new.actif then 'active' else 'desactive' end);
  end if;
  if new.stock_jour is distinct from old.stock_jour then
    if new.stock_jour = 0 and coalesce(old.stock_jour, 1) <> 0 then
      insert into produits_historique_dispo (produit_id, produit_nom, evenement)
      values (new.id, new.nom, 'epuise');
    elsif old.stock_jour = 0 and (new.stock_jour is null or new.stock_jour > 0) then
      insert into produits_historique_dispo (produit_id, produit_nom, evenement)
      values (new.id, new.nom, 'reapprovisionne');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists produits_dispo_trigger on produits;
create trigger produits_dispo_trigger
  after update on produits
  for each row execute function enregistrer_dispo_produit();

-- Etat de depart : point de reference pour calculer les durees d'indisponibilite.
insert into produits_historique_dispo (produit_id, produit_nom, evenement)
select id, nom, case when actif then 'etat_initial_actif' else 'etat_initial_inactif' end
from produits;
