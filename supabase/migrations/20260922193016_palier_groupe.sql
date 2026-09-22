-- Palier de l'offre "commande groupée avant 11h" (remplace l'ancienne
-- priorité automatique dès 3 plats). Calculé une seule fois à la
-- soumission (nb plats + montant brut + canal + heure Mayotte), jamais
-- re-dérivé ensuite pour éviter l'ambiguïté brut/net après remise.
alter table commandes
  add column if not exists palier_groupe text null;
