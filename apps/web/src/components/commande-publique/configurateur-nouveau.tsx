"use client";

import { useState } from "react";
import type { ProduitConfigurable, ViandePublique, SaucePublique, SaveurPublique } from "@/lib/commande-publique/types";
import { GROUPE_ACCOMPAGNEMENT_COMBINABLE, GROUPE_ACCOMPAGNEMENT_EXCLUSIF } from "@/lib/commande-publique/accompagnements";
import {
  MONTANT_REDUCTION_SANS_BOISSON,
  MONTANT_SUPPLEMENT_SALADE_ET_BOISSON,
  NOM_PRODUIT_MENU_ETUDIANT,
} from "@/lib/commande-publique/types";
import { nomSansMultiplicateur } from "@/lib/pieces-produit";
import type { AccompagnementPublique, ExtrasChoisis } from "./viande-modal-publique";

interface ConfigurateurNouveauProps {
  produit: ProduitConfigurable;
  viandes: ViandePublique[];
  sauces: SaucePublique[];
  saveurs: SaveurPublique[];
  accompagnements: AccompagnementPublique[];
  produitViandeSupplementaire: ProduitConfigurable | null;
  produitSauceSupplementaire: ProduitConfigurable | null;
  canetteRapideProduit?: ProduitConfigurable | null;
  canetteRapideSaveurs?: SaveurPublique[];
  onValider: (
    viandes: string[],
    sauces: string[],
    extras: ExtrasChoisis,
    boissonIncluse: string | null,
    saladeIncluse: boolean | null,
    saladeOption: boolean,
    accompagnementsInclus: string[],
    sansBoisson: boolean,
    quantite: number,
    canettesRapidesChoisies: string[],
    sansSauce: boolean
  ) => void;
  onAnnuler: () => void;
  quantiteMax?: number;
}

const ROUGE = "#8B2020";
const VERT = "#2D5A27";
const ORANGE = "#C2540C";
const QUANTITE_MAX_DEFAUT = 20;

const euros = (montant: number) => `${montant.toFixed(2).replace(".", ",")} €`;

function Pastille({
  actif,
  couleur,
  onClick,
  disabled,
  children,
}: {
  actif: boolean;
  couleur: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border-2 px-4 py-2 text-base font-bold active:scale-95 disabled:opacity-30"
      style={actif ? { borderColor: couleur, backgroundColor: couleur, color: "#fff" } : { borderColor: "#6b7280", backgroundColor: "#fff", color: "#111827" }}
    >
      {children}
    </button>
  );
}

function Etape({ numero, titre, aide, couleur, children }: { numero: number; titre: string; aide?: string; couleur: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-gray-300 bg-white p-4">
      <div>
        <p className="text-lg font-extrabold text-gray-900">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm text-white" style={{ backgroundColor: couleur }}>
            {numero}
          </span>
          {titre}
        </p>
        {aide && <p className="mt-0.5 text-sm font-semibold text-gray-800">{aide}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Configurateur de la nouvelle page de commande : mêmes règles et mêmes
 * paramètres que `ViandeModalPublique` (viande imposée ou à choisir, sauces,
 * salade/boisson, accompagnements, canette), mais en écran plein avec étapes
 * numérotées et prix en direct sur le bouton. Les sauces au-delà de celles
 * incluses deviennent automatiquement des « sauces supplémentaires » payantes.
 */
export function ConfigurateurNouveau({
  produit,
  viandes,
  sauces,
  saveurs,
  accompagnements,
  produitViandeSupplementaire,
  produitSauceSupplementaire,
  canetteRapideProduit,
  canetteRapideSaveurs = [],
  onValider,
  onAnnuler,
  quantiteMax = QUANTITE_MAX_DEFAUT,
}: ConfigurateurNouveauProps) {
  const [quantite, setQuantite] = useState(1);
  const [viandesChoisies, setViandesChoisies] = useState<string[]>([]);
  // Ordre de sélection conservé : les N premières sont incluses, les suivantes payantes.
  const [saucesChoisies, setSaucesChoisies] = useState<string[]>([]);
  const [sansSauce, setSansSauce] = useState(false);
  const [extraViandes, setExtraViandes] = useState<string[]>([]);
  const [canettesRapides, setCanettesRapides] = useState<string[]>([]);
  const [boissonChoisie, setBoissonChoisie] = useState<string | null>(null);
  const [saladeGardee, setSaladeGardee] = useState<boolean | null>(null);
  const [boissonVoulue, setBoissonVoulue] = useState(false);
  const [saladeOptionCochee, setSaladeOptionCochee] = useState(false);
  const [accompagnementsChoisis, setAccompagnementsChoisis] = useState<string[]>([]);

  const demandeViande = !produit.viandeImposee && produit.nbViandesMax > 0;
  const proposeSansBoisson = produit.canetteIncluse && produit.nom !== NOM_PRODUIT_MENU_ETUDIANT;
  const demandeChoixBoisson = produit.canetteIncluse && (proposeSansBoisson || saveurs.length > 1);
  const demandeSaladeOuBoisson = produit.saladeOuBoisson;
  const sansBoisson = proposeSansBoisson && boissonChoisie === null;
  const boissonRetenue = demandeSaladeOuBoisson
    ? boissonVoulue
      ? boissonChoisie
      : null
    : !produit.canetteIncluse || sansBoisson
      ? null
      : demandeChoixBoisson
        ? boissonChoisie
        : (saveurs[0]?.nom ?? null);
  const demandeAccompagnement = produit.accompagnementInclus && accompagnements.length > 0;
  const proposeCanetteRapide =
    !produit.canetteIncluse && !produit.saladeOuBoisson && !!canetteRapideProduit && canetteRapideSaveurs.length > 0;
  const demandeSauce = produit.nbSaucesIncluses > 0 && sauces.length > 0;
  const sauceExtraPossible = !!produitSauceSupplementaire;
  const prixSauceExtra = produitSauceSupplementaire?.prix ?? 0;
  const prixViandeExtra = produitViandeSupplementaire?.prix ?? 0;
  const prixCanette = canetteRapideProduit?.prix ?? 0;

  const saucesIncluses = saucesChoisies.slice(0, produit.nbSaucesIncluses);
  const saucesPayantes = saucesChoisies.slice(produit.nbSaucesIncluses);

  const toutSelectionne =
    (!demandeViande || viandesChoisies.length === produit.nbViandesMax) &&
    (!demandeSauce || sansSauce || saucesChoisies.length >= 1) &&
    (!demandeChoixBoisson || sansBoisson || boissonChoisie !== null) &&
    (!produit.saladeIncluse || saladeGardee !== null) &&
    (!demandeSaladeOuBoisson || ((saladeGardee === true || boissonVoulue) && (!boissonVoulue || boissonChoisie !== null))) &&
    (!demandeAccompagnement || accompagnementsChoisis.length >= 1);

  // Prix d'une unité : même calcul que le panier (prixLigne) + les extras vendus comme lignes distinctes.
  const prixBase = produit.prix ?? 0;
  const prixUnite =
    prixBase +
    (produit.canetteIncluse && produit.nom !== NOM_PRODUIT_MENU_ETUDIANT && !sansBoisson ? MONTANT_REDUCTION_SANS_BOISSON : 0) +
    (saladeOptionCochee ? (produit.saladePrixOption ?? 0) : 0) +
    (demandeSaladeOuBoisson && saladeGardee === true && boissonVoulue && boissonRetenue ? MONTANT_SUPPLEMENT_SALADE_ET_BOISSON : 0);
  const prixExtras = extraViandes.length * prixViandeExtra + saucesPayantes.length * prixSauceExtra + canettesRapides.length * prixCanette;
  const prixTotal = prixUnite * quantite + prixExtras;

  function toggleViande(nom: string) {
    setViandesChoisies((prec) => (prec.length >= produit.nbViandesMax ? prec : [...prec, nom]));
  }
  function retirerViande(nom: string) {
    setViandesChoisies((prec) => {
      const i = prec.lastIndexOf(nom);
      if (i === -1) return prec;
      return prec.filter((_, idx) => idx !== i);
    });
  }
  function toggleSauce(nom: string) {
    setSansSauce(false);
    setSaucesChoisies((prec) => {
      if (prec.includes(nom)) return prec.filter((n) => n !== nom);
      // Au-delà des sauces incluses, il faut pouvoir les facturer.
      if (prec.length >= produit.nbSaucesIncluses && !sauceExtraPossible) return prec;
      return [...prec, nom];
    });
  }
  function toggleAccompagnement(nom: string) {
    setAccompagnementsChoisis((precedent) => {
      if (precedent.includes(nom)) return precedent.filter((n) => n !== nom);
      if (GROUPE_ACCOMPAGNEMENT_EXCLUSIF.has(nom)) return [nom];
      const combinablesActuels = precedent.filter((n) => GROUPE_ACCOMPAGNEMENT_COMBINABLE.has(n));
      if (combinablesActuels.length >= 2) return precedent;
      return [...combinablesActuels, nom];
    });
  }

  // Produit sans choix de viande ni de sauce (plat du jour, menu…) : petite fenêtre en bas, comme les autres ; snacks : plein écran.
  const compact = !demandeViande && !demandeSauce;
  let numero = 0;
  const prochain = () => ++numero;

  return (
    <div className={compact ? "fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" : "fixed inset-0 z-50 bg-[#F5F0E8]"}>
    <div className={compact ? "flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-[#F5F0E8] sm:rounded-2xl" : "flex h-full flex-col"}>
      <div className="flex items-center gap-3 border-b border-gray-300 bg-white px-4 py-3">
        <button type="button" onClick={onAnnuler} aria-label="Retour" className="text-2xl font-bold text-gray-900">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-gray-900">{produit.nom}</p>
          {produit.description && <p className="truncate text-sm font-medium text-gray-800">{produit.description}</p>}
        </div>
        <p className="whitespace-nowrap text-xl font-extrabold" style={{ color: ROUGE }}>
          {euros(prixBase)}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {produit.viandeImposee && (
          <p className="rounded-lg bg-white px-3 py-2 text-base font-semibold text-gray-900">
            Viande : <strong>{produit.viandeImposee}</strong>
          </p>
        )}

        {demandeViande && (
          <Etape
            numero={prochain()}
            titre={`Tes ${produit.nbViandesMax} viande${produit.nbViandesMax > 1 ? "s" : ""}`}
            aide={`Choisis-en ${produit.nbViandesMax} (${viandesChoisies.length}/${produit.nbViandesMax})`}
            couleur={ROUGE}
          >
            <div className="flex flex-wrap gap-2">
              {viandes.map((v) => {
                const count = viandesChoisies.filter((c) => c === v.nom).length;
                return (
                  <Pastille
                    key={v.id}
                    actif={count > 0}
                    couleur={ROUGE}
                    disabled={count === 0 && viandesChoisies.length >= produit.nbViandesMax}
                    onClick={() => toggleViande(v.nom)}
                  >
                    {v.nom}
                    {count > 1 ? ` ×${count}` : ""}
                  </Pastille>
                );
              })}
            </div>
            {viandesChoisies.length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm font-bold text-gray-900">
                {[...new Set(viandesChoisies)].map((nom) => (
                  <button key={nom} type="button" onClick={() => retirerViande(nom)} className="underline">
                    Retirer {nom}
                  </button>
                ))}
              </div>
            )}
          </Etape>
        )}

        {demandeSauce && (
          <Etape
            numero={prochain()}
            titre="Tes sauces"
            aide={
              sauceExtraPossible
                ? `${produit.nbSaucesIncluses} incluses, +${euros(prixSauceExtra)} ensuite`
                : `Jusqu'à ${produit.nbSaucesIncluses} sauces incluses`
            }
            couleur={VERT}
          >
            <div className="flex flex-wrap gap-2">
              <Pastille
                actif={sansSauce}
                couleur={ROUGE}
                onClick={() => {
                  setSansSauce((prec) => !prec);
                  setSaucesChoisies([]);
                }}
              >
                Sans sauce
              </Pastille>
              {sauces.map((s) => {
                const index = saucesChoisies.indexOf(s.nom);
                const payante = index >= produit.nbSaucesIncluses;
                return (
                  <Pastille
                    key={s.id}
                    actif={index !== -1}
                    couleur={payante ? ORANGE : VERT}
                    disabled={index === -1 && saucesChoisies.length >= produit.nbSaucesIncluses && !sauceExtraPossible}
                    onClick={() => toggleSauce(s.nom)}
                  >
                    {s.nom}
                    {payante ? ` (+${euros(prixSauceExtra)})` : ""}
                  </Pastille>
                );
              })}
            </div>
            {saucesIncluses.length > 0 && (
              <p className="text-sm font-bold text-gray-900">
                {saucesIncluses.length}/{produit.nbSaucesIncluses} incluses
                {saucesPayantes.length > 0 ? ` · ${saucesPayantes.length} en plus = ${euros(saucesPayantes.length * prixSauceExtra)}` : ""}
              </p>
            )}
          </Etape>
        )}

        {produit.saladeIncluse && (
          <Etape numero={prochain()} titre="Salade incluse" couleur={VERT}>
            <div className="flex gap-2">
              <Pastille actif={saladeGardee === true} couleur={VERT} onClick={() => setSaladeGardee(true)}>
                Avec salade
              </Pastille>
              <Pastille actif={saladeGardee === false} couleur={VERT} onClick={() => setSaladeGardee(false)}>
                Sans salade
              </Pastille>
            </div>
          </Etape>
        )}

        {demandeSaladeOuBoisson && (
          <Etape
            numero={prochain()}
            titre="Salade ou boisson"
            aide={`Inclus au choix. Les deux : +${euros(MONTANT_SUPPLEMENT_SALADE_ET_BOISSON)}`}
            couleur={VERT}
          >
            <div className="flex gap-2">
              <Pastille actif={saladeGardee === true} couleur={VERT} onClick={() => setSaladeGardee((prec) => (prec === true ? false : true))}>
                Salade
              </Pastille>
              <Pastille actif={boissonVoulue} couleur={ORANGE} onClick={() => setBoissonVoulue((prec) => !prec)}>
                Boisson
              </Pastille>
            </div>
            {boissonVoulue && (
              <div className="flex flex-wrap gap-2">
                {saveurs.map((s) => (
                  <Pastille key={s.id} actif={boissonChoisie === s.nom} couleur={ORANGE} onClick={() => setBoissonChoisie(s.nom)}>
                    {s.nom}
                  </Pastille>
                ))}
              </div>
            )}
            {saladeGardee === true && boissonVoulue && (
              <p className="text-sm font-bold" style={{ color: ROUGE }}>
                Salade + boisson : +{euros(MONTANT_SUPPLEMENT_SALADE_ET_BOISSON)}
              </p>
            )}
          </Etape>
        )}

        {demandeAccompagnement && (
          <Etape numero={prochain()} titre="Ton accompagnement" aide="Choisis-en un (jusqu'à 2 si combinables)" couleur={VERT}>
            <div className="flex flex-wrap gap-2">
              {accompagnements.map((a) => {
                const choisi = accompagnementsChoisis.includes(a.nom);
                const combinablesActuels = accompagnementsChoisis.filter((n) => GROUPE_ACCOMPAGNEMENT_COMBINABLE.has(n));
                const desactive = !choisi && GROUPE_ACCOMPAGNEMENT_COMBINABLE.has(a.nom) && combinablesActuels.length >= 2;
                return (
                  <Pastille key={a.id} actif={choisi} couleur={VERT} disabled={desactive} onClick={() => toggleAccompagnement(a.nom)}>
                    {nomSansMultiplicateur(a.nom)}
                  </Pastille>
                );
              })}
            </div>
          </Etape>
        )}

        {demandeChoixBoisson && (
          <Etape
            numero={prochain()}
            titre={proposeSansBoisson ? "Une canette avec ?" : "Ta canette incluse"}
            aide={proposeSansBoisson ? `+${euros(MONTANT_REDUCTION_SANS_BOISSON)} — touche à nouveau pour l'enlever` : undefined}
            couleur={ORANGE}
          >
            <div className="flex flex-wrap gap-2">
              {saveurs.map((s) => (
                <Pastille
                  key={s.id}
                  actif={boissonChoisie === s.nom}
                  couleur={ORANGE}
                  onClick={() => setBoissonChoisie((prec) => (proposeSansBoisson && prec === s.nom ? null : s.nom))}
                >
                  {s.nom}
                </Pastille>
              ))}
            </div>
          </Etape>
        )}

        {(produit.saladePrixOption !== null ||
          (produit.autoriseExtras && produitViandeSupplementaire) ||
          proposeCanetteRapide) && (
          <Etape numero={prochain()} titre="Options" couleur={ORANGE}>
            {produit.saladePrixOption !== null && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-300 px-3 py-3">
                <span className="text-base font-bold text-gray-900">Salade supplémentaire</span>
                <span className="flex items-center gap-3">
                  <span className="text-base font-extrabold" style={{ color: ROUGE }}>
                    +{euros(produit.saladePrixOption)}
                  </span>
                  <input
                    type="checkbox"
                    checked={saladeOptionCochee}
                    onChange={(e) => setSaladeOptionCochee(e.target.checked)}
                    className="h-6 w-6"
                  />
                </span>
              </label>
            )}

            {produit.autoriseExtras && produitViandeSupplementaire && (
              <div className="space-y-2 rounded-lg border border-gray-300 p-3">
                <p className="text-base font-bold text-gray-900">
                  Viande supplémentaire{" "}
                  <span className="font-extrabold" style={{ color: ROUGE }}>
                    +{euros(prixViandeExtra)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {viandes.map((v) => {
                    const count = extraViandes.filter((c) => c === v.nom).length;
                    return (
                      <Pastille
                        key={v.id}
                        actif={count > 0}
                        couleur={ROUGE}
                        onClick={() => setExtraViandes((prec) => (prec.length >= 20 ? prec : [...prec, v.nom]))}
                      >
                        {v.nom}
                        {count > 0 ? ` ×${count}` : ""}
                      </Pastille>
                    );
                  })}
                </div>
                {extraViandes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-900">
                    {[...new Set(extraViandes)].map((nom) => (
                      <button
                        key={nom}
                        type="button"
                        onClick={() =>
                          setExtraViandes((prec) => {
                            const i = prec.lastIndexOf(nom);
                            return prec.filter((_, idx) => idx !== i);
                          })
                        }
                        className="underline"
                      >
                        Retirer {nom}
                      </button>
                    ))}
                    <span style={{ color: ROUGE }}>= {euros(extraViandes.length * prixViandeExtra)}</span>
                  </div>
                )}
              </div>
            )}

            {proposeCanetteRapide && (
              <div className="space-y-2 rounded-lg border border-gray-300 p-3">
                <p className="text-base font-bold text-gray-900">
                  Une canette{" "}
                  <span className="font-extrabold" style={{ color: ROUGE }}>
                    +{euros(prixCanette)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {canetteRapideSaveurs.map((s) => {
                    const count = canettesRapides.filter((c) => c === s.nom).length;
                    return (
                      <Pastille key={s.id} actif={count > 0} couleur={ORANGE} onClick={() => setCanettesRapides((prec) => [...prec, s.nom])}>
                        {s.nom}
                        {count > 0 ? ` ×${count}` : ""}
                      </Pastille>
                    );
                  })}
                </div>
                {canettesRapides.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-900">
                    {[...new Set(canettesRapides)].map((nom) => (
                      <button
                        key={nom}
                        type="button"
                        onClick={() =>
                          setCanettesRapides((prec) => {
                            const i = prec.lastIndexOf(nom);
                            return prec.filter((_, idx) => idx !== i);
                          })
                        }
                        className="underline"
                      >
                        Retirer {nom}
                      </button>
                    ))}
                    <span style={{ color: ROUGE }}>= {euros(canettesRapides.length * prixCanette)}</span>
                  </div>
                )}
              </div>
            )}
          </Etape>
        )}
      </div>

      <div className="border-t border-gray-300 bg-white p-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantite((q) => Math.max(1, q - 1))}
              disabled={quantite <= 1}
              aria-label="Retirer une unité"
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-2xl font-bold disabled:opacity-30"
              style={{ borderColor: ROUGE, color: ROUGE }}
            >
              −
            </button>
            <span className="w-7 text-center text-xl font-extrabold text-gray-900">{quantite}</span>
            <button
              type="button"
              onClick={() => setQuantite((q) => Math.min(quantiteMax, q + 1))}
              disabled={quantite >= quantiteMax}
              aria-label="Ajouter une unité"
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-white disabled:opacity-30"
              style={{ backgroundColor: ROUGE }}
            >
              +
            </button>
          </div>
          <button
            type="button"
            disabled={!toutSelectionne}
            onClick={() =>
              onValider(
                produit.viandeImposee ? [produit.viandeImposee] : viandesChoisies,
                saucesIncluses,
                { viandesSupplementaires: extraViandes, saucesSupplementaires: saucesPayantes },
                boissonRetenue,
                produit.saladeIncluse ? saladeGardee : demandeSaladeOuBoisson ? saladeGardee === true : null,
                saladeOptionCochee,
                demandeAccompagnement ? accompagnementsChoisis : [],
                sansBoisson,
                quantite,
                canettesRapides,
                demandeSauce && sansSauce
              )
            }
            className="flex-1 rounded-xl py-4 text-lg font-extrabold text-white disabled:opacity-40"
            style={{ backgroundColor: ROUGE }}
          >
            Ajouter · {euros(prixTotal)}
          </button>
        </div>
        {quantiteMax < QUANTITE_MAX_DEFAUT && (
          <p className="mt-1 text-center text-sm font-semibold text-gray-900">Stock du jour : {quantiteMax} restant(s)</p>
        )}
        {!toutSelectionne && <p className="mt-1 text-center text-sm font-bold" style={{ color: ROUGE }}>Termine tes choix pour ajouter.</p>}
      </div>
    </div>
    </div>
  );
}
