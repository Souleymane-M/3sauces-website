"use client";

import { useState } from "react";
import type { ProduitConfigurable, ViandePublique, SaucePublique, SaveurPublique } from "@/lib/commande-publique/types";
import {
  MONTANT_REDUCTION_SANS_BOISSON,
  MONTANT_SUPPLEMENT_SALADE_ET_BOISSON,
  MONTANT_OIGNONS_FRITS,
  supplementBoissonFormule,
  ajustementBoissonFormule,
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
  /** Boissons 50 cl proposables à la place de la canette dans une formule snack (prix de la carte, − 0,50 € en formule). */
  boissons50cl?: { nom: string; prix: number }[];
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
  /** Modification d'une ligne déjà au panier : les choix de départ, et le bouton devient « Enregistrer ». */
  initial?: {
    quantite: number;
    viandes: string[];
    sauces: string[];
    sansSauce: boolean;
    oignonsFrits: boolean;
    boisson: string | null;
    saladeGardee: boolean | null;
    saladeOption: boolean;
    accompagnements: string[];
  };
}

const ROUGE = "#8B2020";
const VERT = "#2D5A27";
const ORANGE = "#C2540C";
const QUANTITE_MAX_DEFAUT = 20;
/** Accompagnements compris dans le prix d'un plat du jour ; au-delà, chacun est facturé à son prix. */
const NB_ACCOMPAGNEMENTS_INCLUS = 2;
const NB_ACCOMPAGNEMENTS_MAX = 6;
/** Viandes ou sauces au total (incluses + en plus) sur un même plat. */
const NB_SUPPLEMENTS_MAX = 20;

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

/** Ligne à cocher bien visible : le titre du choix (« Salade », « Boisson »…) se distingue des pastilles de saveurs. */
function CaseACocher({
  coche,
  onChange,
  couleur,
  children,
}: {
  coche: boolean;
  onChange: (coche: boolean) => void;
  couleur: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-3"
      style={{ borderColor: coche ? couleur : "#6b7280", backgroundColor: coche ? `${couleur}15` : "#fff" }}
    >
      <input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} className="h-7 w-7 shrink-0" style={{ accentColor: couleur }} />
      <span className="text-lg font-extrabold text-gray-900">{children}</span>
    </label>
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
  boissons50cl = [],
  onValider,
  onAnnuler,
  quantiteMax = QUANTITE_MAX_DEFAUT,
  initial,
}: ConfigurateurNouveauProps) {
  const [quantite, setQuantite] = useState(initial?.quantite ?? 1);
  const [viandesChoisies, setViandesChoisies] = useState<string[]>(initial && !produit.viandeImposee ? initial.viandes : []);
  // Ordre de sélection conservé : les N premières sont incluses, les suivantes payantes.
  const [saucesChoisies, setSaucesChoisies] = useState<string[]>(initial?.sauces ?? []);
  const [sansSauce, setSansSauce] = useState(initial?.sansSauce ?? false);
  const [oignonsFrits, setOignonsFrits] = useState(initial?.oignonsFrits ?? false);
  const [canettesRapides, setCanettesRapides] = useState<string[]>([]);
  const [boissonChoisie, setBoissonChoisie] = useState<string | null>(initial?.boisson ?? null);
  const [saladeGardee, setSaladeGardee] = useState<boolean | null>(initial?.saladeGardee ?? null);
  const [boissonVoulue, setBoissonVoulue] = useState(initial ? !!initial.boisson : false);
  const [saladeOptionCochee, setSaladeOptionCochee] = useState(initial?.saladeOption ?? false);
  const [accompagnementsChoisis, setAccompagnementsChoisis] = useState<string[]>(initial?.accompagnements ?? []);

  const demandeViande = !produit.viandeImposee && produit.nbViandesMax > 0;
  const proposeSansBoisson = produit.canetteIncluse && produit.nom !== NOM_PRODUIT_MENU_ETUDIANT;
  const demandeChoixBoisson = produit.canetteIncluse && (proposeSansBoisson || saveurs.length > 1);
  const demandeSaladeOuBoisson = produit.saladeOuBoisson;
  // Boissons 50 cl au choix à la place de la canette : formules snack seulement (le Menu Étudiant garde sa canette).
  const propose50cl = proposeSansBoisson && produit.categorie === "snacking" && boissons50cl.length > 0;
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
  // Viandes / sauces en plus et oignons frits : snacks uniquement (le serveur refuse le reste).
  const sauceExtraPossible = !!produitSauceSupplementaire && produit.autoriseExtras;
  const viandeExtraPossible = !!produitViandeSupplementaire && produit.autoriseExtras;
  const prixSauceExtra = produitSauceSupplementaire?.prix ?? 0;
  const prixViandeExtra = produitViandeSupplementaire?.prix ?? 0;
  const prixCanette = canetteRapideProduit?.prix ?? 0;

  const saucesIncluses = saucesChoisies.slice(0, produit.nbSaucesIncluses);
  const saucesPayantes = saucesChoisies.slice(produit.nbSaucesIncluses);
  // Viandes : les N premières sont incluses, les suivantes payantes (même logique que les sauces).
  const viandesIncluses = viandesChoisies.slice(0, produit.nbViandesMax);
  const viandesPayantes = viandesChoisies.slice(produit.nbViandesMax);
  /** Nombre d'unités payantes par nom (ex. une sauce choisie 3 fois dont 1 payante). */
  const payantsParNom = (choisies: string[], nbIncluses: number) => {
    const m = new Map<string, number>();
    choisies.slice(nbIncluses).forEach((n) => m.set(n, (m.get(n) ?? 0) + 1));
    return m;
  };
  const viandesPayantesParNom = payantsParNom(viandesChoisies, produit.nbViandesMax);
  const saucesPayantesParNom = payantsParNom(saucesChoisies, produit.nbSaucesIncluses);

  const toutSelectionne =
    (!demandeViande || viandesChoisies.length >= produit.nbViandesMax) &&
    (!demandeSauce || sansSauce || saucesChoisies.length >= 1) &&
    (!demandeChoixBoisson || sansBoisson || boissonChoisie !== null) &&
    (!produit.saladeIncluse || saladeGardee !== null) &&
    (!demandeSaladeOuBoisson || ((saladeGardee === true || boissonVoulue) && (!boissonVoulue || boissonChoisie !== null))) &&
    (!demandeAccompagnement || accompagnementsChoisis.length >= 1);

  // Prix d'une unité : même calcul que le panier (prixLigne) + les extras vendus comme lignes distinctes.
  const prixBase = produit.prix ?? 0;
  const prixUnite =
    prixBase +
    ajustementBoissonFormule(produit, sansBoisson, boissonChoisie, boissons50cl) +
    (saladeOptionCochee ? (produit.saladePrixOption ?? 0) : 0) +
    (demandeSaladeOuBoisson && saladeGardee === true && boissonVoulue && boissonRetenue ? MONTANT_SUPPLEMENT_SALADE_ET_BOISSON : 0);
  const prixAccompagnement = (nom: string) => accompagnements.find((a) => a.nom === nom)?.prix ?? 0;
  const accompagnementsPayants = accompagnementsChoisis.slice(NB_ACCOMPAGNEMENTS_INCLUS);
  const prixAccompagnementsPayants = accompagnementsPayants.reduce((t, n) => t + prixAccompagnement(n), 0);
  const prixExtras = prixAccompagnementsPayants + viandesPayantes.length * prixViandeExtra + saucesPayantes.length * prixSauceExtra + canettesRapides.length * prixCanette + (oignonsFrits ? MONTANT_OIGNONS_FRITS : 0);
  const prixTotal = prixUnite * quantite + prixExtras;

  function ajouterViande(nom: string) {
    setViandesChoisies((prec) => {
      if (prec.length >= NB_SUPPLEMENTS_MAX) return prec;
      // Au-delà des viandes incluses, il faut pouvoir les facturer.
      if (prec.length >= produit.nbViandesMax && !viandeExtraPossible) return prec;
      return [...prec, nom];
    });
  }
  function retirerViande(nom: string) {
    setViandesChoisies((prec) => {
      const i = prec.lastIndexOf(nom);
      if (i === -1) return prec;
      return prec.filter((_, idx) => idx !== i);
    });
  }
  function ajouterSauce(nom: string) {
    setSansSauce(false);
    setSaucesChoisies((prec) => {
      if (prec.length >= NB_SUPPLEMENTS_MAX) return prec;
      // Une même sauce peut être choisie plusieurs fois ; au-delà des sauces incluses, il faut pouvoir les facturer.
      if (prec.length >= produit.nbSaucesIncluses && !sauceExtraPossible) return prec;
      return [...prec, nom];
    });
  }
  function retirerSauce(nom: string) {
    setSaucesChoisies((prec) => {
      const i = prec.lastIndexOf(nom);
      if (i === -1) return prec;
      return prec.filter((_, idx) => idx !== i);
    });
  }
  function toggleAccompagnement(nom: string) {
    setAccompagnementsChoisis((precedent) => {
      if (precedent.includes(nom)) return precedent.filter((n) => n !== nom);
      if (precedent.length >= NB_ACCOMPAGNEMENTS_MAX) return precedent;
      return [...precedent, nom];
    });
  }

  let numero = 0;
  const prochain = () => ++numero;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
    <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-[#F5F0E8] sm:rounded-2xl">
      <div className="flex items-center gap-3 border-b border-gray-300 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-extrabold leading-tight text-gray-900">{produit.nom}</p>
          {produit.description && <p className="text-sm font-medium text-gray-800">{produit.description}</p>}
        </div>
        <p className="whitespace-nowrap text-xl font-extrabold" style={{ color: ROUGE }}>
          {euros(prixBase)}
        </p>
        <button type="button" onClick={onAnnuler} aria-label="Fermer" className="-mr-1 px-2 text-2xl font-bold text-gray-900">
          ✕
        </button>
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
            titre={`Tes viandes (${produit.nbViandesMax} incluse${produit.nbViandesMax > 1 ? "s" : ""})`}
            aide={
              viandeExtraPossible
                ? `Choisis-en ${produit.nbViandesMax} · une viande en plus : +${euros(prixViandeExtra)} chacune`
                : `Choisis-en ${produit.nbViandesMax} (${viandesChoisies.length}/${produit.nbViandesMax})`
            }
            couleur={ROUGE}
          >
            <div className="flex flex-wrap gap-2">
              {viandes.map((v) => {
                const count = viandesChoisies.filter((c) => c === v.nom).length;
                const payantes = viandesPayantesParNom.get(v.nom) ?? 0;
                return (
                  <Pastille
                    key={v.id}
                    actif={count > 0}
                    couleur={payantes > 0 ? ORANGE : ROUGE}
                    disabled={viandesChoisies.length >= produit.nbViandesMax && !viandeExtraPossible}
                    onClick={() => ajouterViande(v.nom)}
                  >
                    {v.nom}
                    {count > 1 ? ` ×${count}` : ""}
                    {payantes > 0 ? ` (+${euros(payantes * prixViandeExtra)})` : ""}
                  </Pastille>
                );
              })}
            </div>
            {viandesChoisies.length > 0 && (
              <>
                <p className="text-sm font-bold text-gray-900">
                  {viandesIncluses.length}/{produit.nbViandesMax} incluses
                  {viandesPayantes.length > 0 ? ` · ${viandesPayantes.length} en plus = ${euros(viandesPayantes.length * prixViandeExtra)}` : ""}
                </p>
                <div className="flex flex-wrap gap-3 text-sm font-bold text-gray-900">
                  {[...new Set(viandesChoisies)].map((nom) => (
                    <button key={nom} type="button" onClick={() => retirerViande(nom)} className="underline">
                      Retirer {nom}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Etape>
        )}

        {demandeSauce && (
          <Etape
            numero={prochain()}
            titre="Tes sauces"
            aide={
              sauceExtraPossible
                ? `${produit.nbSaucesIncluses} incluses, +${euros(prixSauceExtra)} ensuite · tu peux reprendre la même sauce`
                : `Jusqu'à ${produit.nbSaucesIncluses} sauces incluses`
            }
            couleur={VERT}
          >
            <CaseACocher
              coche={sansSauce}
              couleur={ROUGE}
              onChange={(c) => {
                setSansSauce(c);
                if (c) setSaucesChoisies([]);
              }}
            >
              Sans sauce
            </CaseACocher>
            <div className="flex flex-wrap gap-2">
              {sauces.map((sc) => {
                const count = saucesChoisies.filter((c) => c === sc.nom).length;
                const payantes = saucesPayantesParNom.get(sc.nom) ?? 0;
                return (
                  <Pastille
                    key={sc.id}
                    actif={count > 0}
                    couleur={payantes > 0 ? ORANGE : VERT}
                    disabled={saucesChoisies.length >= produit.nbSaucesIncluses && !sauceExtraPossible}
                    onClick={() => ajouterSauce(sc.nom)}
                  >
                    {sc.nom}
                    {count > 1 ? ` ×${count}` : ""}
                    {payantes > 0 ? ` (+${euros(payantes * prixSauceExtra)})` : ""}
                  </Pastille>
                );
              })}
            </div>
            {saucesChoisies.length > 0 && (
              <>
                <p className="text-sm font-bold text-gray-900">
                  {saucesIncluses.length}/{produit.nbSaucesIncluses} incluses
                  {saucesPayantes.length > 0 ? ` · ${saucesPayantes.length} en plus = ${euros(saucesPayantes.length * prixSauceExtra)}` : ""}
                </p>
                <div className="flex flex-wrap gap-3 text-sm font-bold text-gray-900">
                  {[...new Set(saucesChoisies)].map((nom) => (
                    <button key={nom} type="button" onClick={() => retirerSauce(nom)} className="underline">
                      Retirer {nom}
                    </button>
                  ))}
                </div>
              </>
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
            <CaseACocher coche={saladeGardee === true} couleur={VERT} onChange={(c) => setSaladeGardee(c)}>
              Salade
            </CaseACocher>
            <CaseACocher
              coche={boissonVoulue}
              couleur={ORANGE}
              onChange={(c) => {
                setBoissonVoulue(c);
                if (!c) setBoissonChoisie(null);
              }}
            >
              Boisson
            </CaseACocher>
            {boissonVoulue && (
              <div className="ml-4 space-y-2 border-l-4 pl-3" style={{ borderColor: ORANGE }}>
                <p className="text-sm font-extrabold text-gray-900">Choisis ta boisson :</p>
                <div className="flex flex-wrap gap-2">
                  {saveurs.map((s) => (
                    <Pastille key={s.id} actif={boissonChoisie === s.nom} couleur={ORANGE} onClick={() => setBoissonChoisie(s.nom)}>
                      {s.nom}
                    </Pastille>
                  ))}
                </div>
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
          <Etape
            numero={prochain()}
            titre="Tes accompagnements"
            aide={`${NB_ACCOMPAGNEMENTS_INCLUS} inclus, au choix · le 3e et les suivants au prix indiqué`}
            couleur={VERT}
          >
            <div className="flex flex-wrap gap-2">
              {accompagnements.map((a) => {
                const index = accompagnementsChoisis.indexOf(a.nom);
                const choisi = index !== -1;
                const payant = index >= NB_ACCOMPAGNEMENTS_INCLUS;
                const prochainSeraPayant = !choisi && accompagnementsChoisis.length >= NB_ACCOMPAGNEMENTS_INCLUS;
                return (
                  <Pastille key={a.id} actif={choisi} couleur={payant ? ORANGE : VERT} onClick={() => toggleAccompagnement(a.nom)}>
                    {nomSansMultiplicateur(a.nom)}
                    {payant || prochainSeraPayant ? ` (+${euros(a.prix ?? 0)})` : ""}
                  </Pastille>
                );
              })}
            </div>
            <p className="text-sm font-bold text-gray-900">
              {Math.min(accompagnementsChoisis.length, NB_ACCOMPAGNEMENTS_INCLUS)}/{NB_ACCOMPAGNEMENTS_INCLUS} inclus
              {accompagnementsPayants.length > 0 ? ` · ${accompagnementsPayants.length} en plus = ${euros(prixAccompagnementsPayants)}` : ""}
            </p>
          </Etape>
        )}

        {demandeChoixBoisson && (
          <Etape
            numero={prochain()}
            titre={
              produit.categorie === "plat_du_jour"
                ? "Boisson"
                : proposeSansBoisson
                  ? propose50cl
                    ? "Une boisson avec ?"
                    : "Une canette avec ?"
                  : "Ta canette incluse"
            }
            aide={
              produit.categorie === "plat_du_jour"
                ? undefined
                : proposeSansBoisson
                  ? "Touche à nouveau pour l'enlever"
                  : undefined
            }
            couleur={ORANGE}
          >
            {propose50cl && (
              <p className="text-sm font-extrabold text-gray-900">
                Canette 33 cl <span style={{ color: ROUGE }}>+{euros(MONTANT_REDUCTION_SANS_BOISSON)}</span>
              </p>
            )}
            {!propose50cl && proposeSansBoisson && produit.categorie !== "plat_du_jour" && (
              <p className="text-sm font-extrabold" style={{ color: ROUGE }}>
                +{euros(MONTANT_REDUCTION_SANS_BOISSON)}
              </p>
            )}
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
            {propose50cl && (
              <>
                <p className="pt-1 text-sm font-extrabold text-gray-900">
                  Boisson 50 cl{" "}
                  <span style={{ color: ROUGE }}>+{euros(supplementBoissonFormule(boissons50cl[0].nom, boissons50cl))}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {boissons50cl.map((b) => (
                    <Pastille
                      key={b.nom}
                      actif={boissonChoisie === b.nom}
                      couleur={ORANGE}
                      onClick={() => setBoissonChoisie((prec) => (prec === b.nom ? null : b.nom))}
                    >
                      {b.nom}
                      {supplementBoissonFormule(b.nom, boissons50cl) !== supplementBoissonFormule(boissons50cl[0].nom, boissons50cl)
                        ? ` (+${euros(supplementBoissonFormule(b.nom, boissons50cl))})`
                        : ""}
                    </Pastille>
                  ))}
                </div>
              </>
            )}
          </Etape>
        )}

        {(produit.saladePrixOption !== null || produit.autoriseExtras || proposeCanetteRapide) && (
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

            {produit.autoriseExtras && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-300 px-3 py-3">
                <span className="text-base font-bold text-gray-900">Oignons frits</span>
                <span className="flex items-center gap-3">
                  <span className="text-base font-extrabold" style={{ color: ROUGE }}>
                    +{euros(MONTANT_OIGNONS_FRITS)}
                  </span>
                  <input type="checkbox" checked={oignonsFrits} onChange={(e) => setOignonsFrits(e.target.checked)} className="h-6 w-6" />
                </span>
              </label>
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
                produit.viandeImposee ? [produit.viandeImposee] : viandesIncluses,
                saucesIncluses,
                { viandesSupplementaires: viandesPayantes, saucesSupplementaires: saucesPayantes, oignonsFrits },
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
            {initial ? "Enregistrer" : "Ajouter"} · {euros(prixTotal)}
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
