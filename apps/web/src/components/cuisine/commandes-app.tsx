"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine, LivraisonEnCours } from "@/lib/cuisine/types";
import { LIBELLES_STATUT, TRANSITIONS_PAR_CANAL } from "@/lib/cuisine/types";
import { jouerAlerteSonore } from "@/lib/impression/alerte-sonore";
import { libellePalierGroupe } from "@/lib/commande-publique/groupe-priorite";
import { piecesParPaquet, nomSansMultiplicateur } from "@/lib/pieces-produit";
import { regrouperLignesParCategorie } from "@/lib/caisse/regroupement-lignes";
import { formaterTelephoneAffichage } from "@/lib/telephone";
import { IdentificationModal } from "./identification-modal";

interface CommandesAppProps {
  commandesInitiales: CommandeCuisine[];
  aVenirInitial: CommandeCuisine[];
  enLivraisonInitial: LivraisonEnCours[];
}

const INTERVALLE_POLLING_MS = 5000;
const INACTIVITE_LIMITE_MS = 10 * 60 * 1000;
const CLE_EMPLOYE_ACTIF = "cuisine_employe_actif";
// Repli automatique d'une carte dépliée sans action — demande explicite du
// patron, 2026-10-20 : éviter qu'une carte ouverte "pour regarder" reste
// grande ouverte indéfiniment et reprenne la place qu'on vient de gagner.
const REPLI_AUTO_DETAIL_MS = 18000;

interface EmployeActif {
  profilId: string;
  nom: string;
}

// Recherche numéro ET/OU nom — une seule information suffit (demande
// explicite du patron, 2026-10-20 : retrouver une commande précise parmi
// plusieurs qui clignotent ne doit jamais exiger les deux). Le numéro
// tolère avec ou sans "#" et avec ou sans les zéros de tête (ex: "287",
// "0287" et "#287" trouvent tous la même commande).
function commandeCorrespond(recherche: string, numero: number, nom: string): boolean {
  const terme = recherche.trim().toLowerCase().replace(/^#/, "");
  if (!terme) return true;
  const numeroTexte = String(numero);
  const numeroAffiche = numeroTexte.padStart(4, "0");
  return numeroTexte.includes(terme) || numeroAffiche.includes(terme) || nom.toLowerCase().includes(terme);
}

/** Replie automatiquement le détail d'une carte après `REPLI_AUTO_DETAIL_MS` d'inactivité, cf. `REPLI_AUTO_DETAIL_MS`. */
function useDetailAvecRepliAuto(): [boolean, (v: boolean | ((prec: boolean) => boolean)) => void] {
  const [detailOuvert, setDetailOuvert] = useState(false);
  useEffect(() => {
    if (!detailOuvert) return;
    const delai = setTimeout(() => setDetailOuvert(false), REPLI_AUTO_DETAIL_MS);
    return () => clearTimeout(delai);
  }, [detailOuvert]);
  return [detailOuvert, setDetailOuvert];
}

function libelleCanal(canal: CommandeCuisine["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

// Toujours la date ET l'heure, jamais l'heure seule — une commande de la
// veille encore affichée (statut non terminal) est sinon impossible à
// distinguer d'une commande du jour même à l'écran.
function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formaterDateHeureComplete(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Défensif sur chaque champ : d'anciennes commandes (avant l'introduction
// des viandes/sauces/saveurs multiples) ont un `contenu` qui ne respecte
// pas forcément la forme actuelle de LigneCommande.
function detailLigne(l: CommandeCuisine["lignes"][number]): string[] {
  const details: string[] = [];
  if (l.viandes && l.viandes.length > 0) details.push(l.viandes.join(", "));
  if (l.sauces && l.sauces.length > 0) details.push(`Sauces : ${l.sauces.join(", ")}`);
  if (l.saveurs && l.saveurs.length > 0) details.push(l.saveurs.join(", "));
  if (l.boissonIncluse) details.push(`Boisson incluse : ${l.boissonIncluse}`);
  if (l.sansBoisson) details.push("SANS BOISSON — ne pas donner de canette");
  if (l.accompagnementsInclus?.length)
    details.push(`Accompagnement : ${l.accompagnementsInclus.map(nomSansMultiplicateur).join(" + ")}`);
  if (l.pourQui) details.push(`Pour ${l.pourQui}`);
  return details;
}

function estPrioritaire(commande: CommandeCuisine): boolean {
  return commande.palierGroupe !== null;
}

function jourMayotte(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
}

/**
 * Vrai si la commande traîne depuis un jour précédent — l'écran cuisine
 * n'a volontairement aucune limite de date basse (une commande anormale ne
 * doit jamais disparaître en silence), mais ça veut dire qu'une commande
 * jamais validée reste indéfiniment mélangée à celles du jour, sans que
 * personne ne s'en rende compte (vécu avec #299 puis #357/#358,
 * 2026-10-16) — ce signal rend la différence visible d'un coup d'œil,
 * sans rien cacher.
 */
function estAncienne(creeLe: string): boolean {
  return jourMayotte(creeLe) !== jourMayotte(new Date().toISOString());
}

function formaterDepuis(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Minutes écoulées depuis le dernier changement de statut (remis à zéro à chaque étape, demande explicite du patron 2026-10-16) — 15 min sans action dans "En attente"/"En préparation"/"Prête" déclenche un bandeau discret, pas de son (contrairement à une nouvelle commande ou une livraison signalée : ça arriverait trop souvent en période de rush pour rester sonore sans lasser). */
const SEUIL_RETARD_ETAPE_MIN = 15;

function minutesDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

// Lecture pure (aucun Date.now(), aucune écriture) de l'identité persistée
// en sessionStorage — utilisable comme initialiseur paresseux de useState.
function lireIdentitePersistee(): { identite: EmployeActif | null; derniereActivite: number } {
  if (typeof window === "undefined") return { identite: null, derniereActivite: 0 };
  try {
    const brut = sessionStorage.getItem(CLE_EMPLOYE_ACTIF);
    if (!brut) return { identite: null, derniereActivite: 0 };
    const { profilId, nom, derniereActivite } = JSON.parse(brut);
    return { identite: { profilId, nom }, derniereActivite: Number(derniereActivite) || 0 };
  } catch {
    return { identite: null, derniereActivite: 0 };
  }
}

interface CarteCommandeProps {
  commande: CommandeCuisine;
  demanderChangement: (commandeId: string, statut: string, livreurId?: string, motif?: string) => void;
  demanderAnnulation: (commandeId: string) => void;
}

function CarteCommande({ commande, demanderChangement, demanderAnnulation }: CarteCommandeProps) {
  const [detailOuvert, setDetailOuvert] = useDetailAvecRepliAuto();
  const [reimpressionEnCours, setReimpressionEnCours] = useState(false);
  const [reimpressionFaite, setReimpressionFaite] = useState(false);

  async function reimprimer() {
    setReimpressionEnCours(true);
    setReimpressionFaite(false);
    try {
      const res = await fetch("/api/cuisine/reimprimer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: commande.id }),
      });
      if (res.ok) setReimpressionFaite(true);
    } finally {
      setReimpressionEnCours(false);
    }
  }

  const statutSuivant = TRANSITIONS_PAR_CANAL[commande.canal]?.[commande.statut];
  // Depuis le 2026-10-15 : la cuisine ne désigne plus le livreur — le
  // ticket imprimé porte un QR que le livreur scanne lui-même à la prise
  // en charge (cf. /livreur/scan/[code]). Une livraison "prête" n'a donc
  // plus de bouton d'action en cuisine, juste un statut d'attente.
  const enAttenteScanLivreur = commande.canal === "livraison" && commande.statut === "pret";

  const prioritaire = estPrioritaire(commande);
  const ancienne = estAncienne(commande.creeLe);
  const minutesDansEtape = minutesDepuis(commande.statutChangeLe ?? commande.creeLe);
  const enRetard = !ancienne && minutesDansEtape >= SEUIL_RETARD_ETAPE_MIN;
  // Remise éventuelle (lancement et/ou récompense fidélité) : jamais
  // stockée telle quelle en base, déduite de l'écart entre la somme des
  // lignes et le montant réellement dû — pour que l'équipe voie que le
  // client a bénéficié d'une réduction, pas juste le total final.
  const montantBrutCommande = commande.lignes.reduce((t, l) => t + l.prixUnitaire * l.quantite, 0);
  const remiseCommande = Math.round((montantBrutCommande - commande.montant) * 100) / 100;

  return (
    <div
      className={`rounded-xl border-2 p-4 ${
        ancienne
          ? "border-red-600"
          : enRetard
            ? "bordure-urgence-clignotante border-red-600"
            : prioritaire
              ? "border-orange-500"
              : "border-gray-200"
      }`}
    >
      {ancienne && (
        <div className="mb-2 rounded bg-red-600 px-2 py-1 text-base font-bold text-white">
          ⚠️ Depuis {formaterDepuis(commande.creeLe)} — jamais finalisée, à vérifier
        </div>
      )}
      {!ancienne && enRetard && (
        <div className="bandeau-urgence-clignotant mb-2 rounded px-2 py-1 text-base font-bold text-white">
          🚨 Depuis {minutesDansEtape} min dans cette étape — à traiter
        </div>
      )}
      {prioritaire && (
        <div className="mb-2 inline-block rounded bg-orange-500 px-2 py-1 text-base font-bold text-white">
          {libellePalierGroupe(commande.palierGroupe)} 🚀
        </div>
      )}
      <button type="button" onClick={() => setDetailOuvert((v) => !v)} className="w-full text-left">
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold text-black">
            #{commande.numero} {commande.nom && `— ${commande.nom}`}
          </span>
          <span className="text-sm text-gray-400">{detailOuvert ? "▾" : "▸"}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-200 px-2 py-1 text-base font-semibold text-black">
            {libelleCanal(commande.canal)}
          </span>
          <span
            className={`rounded px-2 py-1 text-base font-semibold ${
              commande.origineCaisse ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700"
            }`}
          >
            {commande.origineCaisse ? "🧾 Caisse" : "🌐 Site"}
          </span>
          <span className="text-base text-black">{LIBELLES_STATUT[commande.statut]}</span>
        </div>
      </button>

      {detailOuvert && (
        <div className="mt-2">
          <p className="text-base text-black">Retrait : {formaterHeure(commande.heureSouhaitee)}</p>
          <p className="text-sm text-gray-500">Commandée le {formaterDateHeureComplete(commande.creeLe)}</p>
          {commande.modePaiement === "stripe" && (
            <div className="mt-2 rounded-lg border-2 border-[#2D5A27] bg-[#2D5A27]/10 p-2 text-center">
              <p className="text-lg font-extrabold text-[#2D5A27]">✅ DÉJÀ PAYÉE EN LIGNE</p>
              <p className="text-sm font-semibold text-[#2D5A27]">Ne rien faire payer au client</p>
            </div>
          )}
          {commande.commandeAvance && !commande.ticketImprimeLe && (
            <div className="mt-2 rounded bg-amber-100 p-2 text-sm font-semibold text-amber-900">
              ⚠️ Ticket pas encore imprimé — vérifie que /caisse est ouvert.
            </div>
          )}
          {commande.telephone && (
            <p className="mt-1 text-base text-black">{formaterTelephoneAffichage(commande.telephone)}</p>
          )}
          {commande.canal === "livraison" && commande.adresse && (
            <p className="mt-1 text-base text-black">Adresse : {commande.adresse}</p>
          )}

          <div className="mt-3 space-y-3">
            {regrouperLignesParCategorie(commande.lignes).map((groupe) => (
              <div key={groupe.categorie}>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{groupe.titre}</p>
                <ul className="mt-1 space-y-2">
                  {groupe.lignes.map((ligne, i) => {
                    // Formule "composée" (menu/tacos/plat du jour) : mise en
                    // avant visuelle dès qu'il y a un vrai détail attaché
                    // (viande, boisson incluse...), pour la distinguer d'un
                    // article simple (une grillade seule, par exemple).
                    const estFormuleDetaillee =
                      (groupe.categorie === "menu_special" ||
                        groupe.categorie === "snacking" ||
                        groupe.categorie === "plat_du_jour") &&
                      detailLigne(ligne).length > 0;
                    return (
                      <li key={i} className={`text-lg text-black ${estFormuleDetaillee ? "border-l-4 border-[#8B2020] pl-2" : ""}`}>
                        <span className="font-semibold">
                          {ligne.quantite * piecesParPaquet(ligne.nom)}x {nomSansMultiplicateur(ligne.nom)}
                        </span>{" "}
                        <span className="text-base text-gray-500">({(ligne.prixUnitaire * ligne.quantite).toFixed(2)} €)</span>
                        {detailLigne(ligne).map((detail, j) => (
                          <div key={j} className="text-base text-gray-700">
                            {detail}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Montant réel déjà calculé en base (remises comprises) — jamais à
              resommer les lignes de tête, qui donnerait le montant brut et non
              ce qu'il faut vraiment faire payer. */}
          {remiseCommande > 0.009 && (
            <p className="mt-3 text-center text-base font-semibold text-[#2D5A27]">
              🎁 Remise appliquée : -{remiseCommande.toFixed(2)} €
            </p>
          )}
          <p
            className={
              remiseCommande > 0.009
                ? "mt-1 rounded bg-gray-100 py-2 text-center text-xl font-extrabold text-black"
                : "mt-3 rounded bg-gray-100 py-2 text-center text-xl font-extrabold text-black"
            }
          >
            Total : {commande.montant.toFixed(2)} €
          </p>
        </div>
      )}

      {enAttenteScanLivreur && (
        <p className="mt-4 rounded bg-blue-50 py-3 text-center text-base font-semibold text-blue-700">
          📦 Prête — en attente qu&apos;un livreur scanne le ticket
        </p>
      )}
      {statutSuivant && !enAttenteScanLivreur && (
        <div className="mt-4 space-y-2">
          <button
            onClick={() => demanderChangement(commande.id, statutSuivant)}
            className="w-full rounded bg-[#8B2020] py-3 text-lg font-bold text-white disabled:opacity-40"
          >
            {commande.canal !== "livraison" && statutSuivant === "remis_au_client" ? "Client venu" : LIBELLES_STATUT[statutSuivant]}
          </button>
        </div>
      )}
      {commande.statut === "en_attente" && (
        <div className="mt-2 flex gap-2">
          <a
            href={`/caisse?modifier=${commande.id}`}
            className="flex-1 rounded border border-gray-400 py-2 text-center text-sm font-semibold text-gray-700"
          >
            Modifier
          </a>
          <button
            onClick={() => demanderAnnulation(commande.id)}
            className="flex-1 rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
          >
            Annuler la commande
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={reimprimer}
        disabled={reimpressionEnCours}
        className="mt-2 w-full rounded border border-gray-300 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
      >
        {reimpressionEnCours ? "…" : reimpressionFaite ? "🖨️ Renvoyé à l'imprimante" : "🖨️ Réimprimer (ticket perdu)"}
      </button>
    </div>
  );
}

/**
 * Carte "En cours de livraison" — volontairement plus sobre qu'une alerte
 * rouge clignotante (demande explicite du patron : "attirer l'attention,
 * sans stresser") : un bandeau orange fixe, pas d'animation, mais bien
 * distinct du reste de l'écran.
 */
interface CarteLivraisonEnCoursProps {
  livraison: LivraisonEnCours;
  resoudreLivraison: (commandeId: string, action: "remettre" | "annuler") => void;
}

function CarteLivraisonEnCours({ livraison, resoudreLivraison }: CarteLivraisonEnCoursProps) {
  const ancienne = estAncienne(livraison.creeLe);
  const [detailOuvert, setDetailOuvert] = useDetailAvecRepliAuto();
  const [reimpressionEnCours, setReimpressionEnCours] = useState(false);
  const [reimpressionFaite, setReimpressionFaite] = useState(false);

  async function reimprimer() {
    setReimpressionEnCours(true);
    setReimpressionFaite(false);
    try {
      const res = await fetch("/api/cuisine/reimprimer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId: livraison.id }),
      });
      if (res.ok) setReimpressionFaite(true);
    } finally {
      setReimpressionEnCours(false);
    }
  }

  return (
    <div
      className={`rounded-xl border-2 p-4 ${livraison.alerteSignalee ? "border-orange-500" : ancienne ? "border-red-600" : "border-gray-200"}`}
    >
      {livraison.alerteSignalee && (
        <div className="mb-2 rounded bg-orange-100 p-3">
          <p className="text-lg font-bold text-orange-800">🚨 Impossible de livrer</p>
          {livraison.alerteNote && <p className="mt-1 text-base text-orange-800">{livraison.alerteNote}</p>}
          {livraison.alerteSignaleeLe && (
            <p className="mt-1 text-sm text-orange-700">Signalé à {formaterHeure(livraison.alerteSignaleeLe)}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => resoudreLivraison(livraison.id, "remettre")}
              className="flex-1 rounded bg-[#2D5A27] py-2 text-sm font-semibold text-white"
            >
              🔁 Redonner à un livreur
            </button>
            <button
              type="button"
              onClick={() => resoudreLivraison(livraison.id, "annuler")}
              className="flex-1 rounded border border-red-600 py-2 text-sm font-semibold text-red-600"
            >
              Annuler la commande
            </button>
          </div>
        </div>
      )}
      {!livraison.alerteSignalee && ancienne && (
        <div className="mb-2 rounded bg-red-600 px-2 py-1 text-base font-bold text-white">
          ⚠️ Depuis {formaterDepuis(livraison.creeLe)} — jamais clôturée
        </div>
      )}
      <button type="button" onClick={() => setDetailOuvert((v) => !v)} className="w-full text-left">
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold text-black">
            #{livraison.numero} {livraison.nom && `— ${livraison.nom}`}
          </span>
          <span className="text-sm text-gray-400">{detailOuvert ? "▾" : "▸"}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-200 px-2 py-1 text-base font-semibold text-black">Livraison</span>
          <span
            className={`rounded px-2 py-1 text-base font-semibold ${
              livraison.origineCaisse ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700"
            }`}
          >
            {livraison.origineCaisse ? "🧾 Caisse" : "🌐 Site"}
          </span>
        </div>
      </button>
      <p className="mt-1 text-sm text-gray-500">Livreur : {livraison.livreurNom}</p>

      {detailOuvert && (
        <div className="mt-2">
          <p className="text-base text-black">Retrait : {formaterHeure(livraison.heureSouhaitee)}</p>
          {livraison.telephone && (
            <p className="mt-1 text-base text-black">{formaterTelephoneAffichage(livraison.telephone)}</p>
          )}
          {livraison.adresse && <p className="mt-1 text-base text-black">Adresse : {livraison.adresse}</p>}
          <div className="mt-2 space-y-1">
            {regrouperLignesParCategorie(livraison.lignes).map((groupe) =>
              groupe.lignes.map((ligne, i) => (
                <p key={`${groupe.categorie}-${i}`} className="text-base text-black">
                  {ligne.quantite * piecesParPaquet(ligne.nom)}x {nomSansMultiplicateur(ligne.nom)}
                </p>
              ))
            )}
          </div>
          <p className="mt-3 rounded bg-gray-100 py-2 text-center text-xl font-extrabold text-black">
            {livraison.montant.toFixed(2)} €
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={reimprimer}
        disabled={reimpressionEnCours}
        className="mt-2 w-full rounded border border-gray-300 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
      >
        {reimpressionEnCours ? "…" : reimpressionFaite ? "🖨️ Renvoyé à l'imprimante" : "🖨️ Réimprimer (ticket perdu)"}
      </button>
    </div>
  );
}

function Colonne({ titre, count, children }: { titre: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[280px]">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-700">
        {titre} <span className="rounded-full bg-gray-200 px-2 py-0.5 text-sm text-gray-600">{count}</span>
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function CommandesApp({ commandesInitiales, aVenirInitial, enLivraisonInitial }: CommandesAppProps) {
  const [commandes, setCommandes] = useState<CommandeCuisine[]>(commandesInitiales);
  const [aVenir, setAVenir] = useState<CommandeCuisine[]>(aVenirInitial);
  const [enLivraison, setEnLivraison] = useState<LivraisonEnCours[]>(enLivraisonInitial);
  const [employeActif, setEmployeActif] = useState<EmployeActif | null>(() => lireIdentitePersistee().identite);
  const [modalOuverte, setModalOuverte] = useState(false);
  const [actionEnAttente, setActionEnAttente] = useState<((identite: EmployeActif) => void) | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

  const idsVusRef = useRef<Set<string>>(new Set(commandesInitiales.map((c) => c.id)));
  const alertesVuesRef = useRef<Set<string>>(
    new Set(enLivraisonInitial.filter((l) => l.alerteSignalee).map((l) => l.id))
  );
  const derniereActiviteRef = useRef<number>(0);

  // Initialise le minuteur d'inactivité à partir de la valeur persistée (ou
  // maintenant si rien n'était stocké) — fait dans un effet, jamais pendant
  // le rendu, puisque Date.now() est impur. Si la valeur restaurée dépasse
  // déjà les 10 minutes, le minuteur ci-dessous l'efface au premier passage.
  useEffect(() => {
    const { derniereActivite } = lireIdentitePersistee();
    derniereActiviteRef.current = derniereActivite || Date.now();
  }, []);

  // Suivi d'activité + minuteur de déconnexion auto après 10 min d'inactivité.
  useEffect(() => {
    function surActivite() {
      derniereActiviteRef.current = Date.now();
    }
    window.addEventListener("pointerdown", surActivite);
    window.addEventListener("keydown", surActivite);

    const intervalle = setInterval(() => {
      if (Date.now() - derniereActiviteRef.current > INACTIVITE_LIMITE_MS) {
        setEmployeActif((precedent) => {
          if (precedent) {
            try {
              sessionStorage.removeItem(CLE_EMPLOYE_ACTIF);
            } catch {
              // ignore
            }
          }
          return null;
        });
      }
    }, 30_000);

    return () => {
      window.removeEventListener("pointerdown", surActivite);
      window.removeEventListener("keydown", surActivite);
      clearInterval(intervalle);
    };
  }, []);

  function definirEmployeActif(identite: EmployeActif) {
    setEmployeActif(identite);
    derniereActiviteRef.current = Date.now();
    try {
      sessionStorage.setItem(
        CLE_EMPLOYE_ACTIF,
        JSON.stringify({ ...identite, derniereActivite: Date.now() })
      );
    } catch {
      // ignore
    }
  }

  function changerEmploye() {
    setEmployeActif(null);
    try {
      sessionStorage.removeItem(CLE_EMPLOYE_ACTIF);
    } catch {
      // ignore
    }
    setModalOuverte(true);
    setActionEnAttente(null);
  }

  // Polling : remplace toute la liste (reflète aussi les changements de
  // statut faits par d'autres employés/appareils), joue une alerte sonore
  // pour un id de commande jamais vu, ou pour une livraison tout juste
  // signalée "impossible à livrer" — les deux cas demandent une action
  // immédiate, visible et audible, quel que soit qui se trouve devant
  // l'écran à ce moment-là.
  useEffect(() => {
    let annule = false;

    async function verifier() {
      try {
        const reponse = await fetch("/api/cuisine/commandes", { cache: "no-store" });
        if (!reponse.ok || annule) return;
        const data = await reponse.json();
        const nouvellesCommandes: CommandeCuisine[] = data.commandes ?? [];
        const nouvelEnLivraison: LivraisonEnCours[] = data.enLivraison ?? [];

        const idsNouveaux = nouvellesCommandes.filter((c) => !idsVusRef.current.has(c.id));
        const nouvellesAlertes = nouvelEnLivraison.filter(
          (l) => l.alerteSignalee && !alertesVuesRef.current.has(l.id)
        );
        if (idsNouveaux.length > 0 || nouvellesAlertes.length > 0) {
          jouerAlerteSonore();
          for (const c of idsNouveaux) idsVusRef.current.add(c.id);
          for (const l of nouvellesAlertes) alertesVuesRef.current.add(l.id);
        }

        if (!annule) {
          setCommandes(nouvellesCommandes);
          setAVenir(data.aVenir ?? []);
          setEnLivraison(nouvelEnLivraison);
        }
      } catch {
        // Erreur réseau ponctuelle : le prochain passage réessaiera.
      }
    }

    const intervalle = setInterval(verifier, INTERVALLE_POLLING_MS);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, []);

  async function rafraichir() {
    try {
      const reponse = await fetch("/api/cuisine/commandes", { cache: "no-store" });
      if (!reponse.ok) return;
      const data = await reponse.json();
      setCommandes(data.commandes ?? []);
      setAVenir(data.aVenir ?? []);
      setEnLivraison(data.enLivraison ?? []);
    } catch {
      // ignore, le polling reprendra
    }
  }

  async function appliquerChangement(
    commandeId: string,
    statut: string,
    profilId: string,
    livreurId?: string,
    motif?: string
  ) {
    setErreur(null);
    const reponse = await fetch("/api/cuisine/commandes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandeId, statut, profilId, livreurId, motif }),
    });
    if (!reponse.ok) {
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec du changement de statut.");
      return;
    }
    await rafraichir();
  }

  function demanderChangement(commandeId: string, statut: string, livreurId?: string, motif?: string) {
    const executer = (identite: EmployeActif) => {
      appliquerChangement(commandeId, statut, identite.profilId, livreurId, motif);
    };

    if (employeActif) {
      executer(employeActif);
      return;
    }
    setActionEnAttente(() => executer);
    setModalOuverte(true);
  }

  /** Uniquement pour une commande encore "en_attente" — vérifié aussi côté serveur. */
  function demanderAnnulation(commandeId: string) {
    const motif = window.prompt("Pourquoi annuler cette commande ? (optionnel)");
    if (motif === null) return;
    demanderChangement(commandeId, "annulee", undefined, motif);
  }

  async function appliquerResolutionLivraison(commandeId: string, action: "remettre" | "annuler", profilId: string) {
    setErreur(null);
    const reponse = await fetch("/api/cuisine/livraison-echec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandeId, action, profilId }),
    });
    if (!reponse.ok) {
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec de la résolution.");
      return;
    }
    await rafraichir();
  }

  function resoudreLivraison(commandeId: string, action: "remettre" | "annuler") {
    if (action === "annuler" && !window.confirm("Confirmer l'annulation de cette commande ?")) return;
    const executer = (identite: EmployeActif) => {
      appliquerResolutionLivraison(commandeId, action, identite.profilId);
    };
    if (employeActif) {
      executer(employeActif);
      return;
    }
    setActionEnAttente(() => executer);
    setModalOuverte(true);
  }

  const commandesFiltrees = commandes.filter((c) => commandeCorrespond(recherche, c.numero, c.nom));
  const enLivraisonFiltree = enLivraison.filter((l) => commandeCorrespond(recherche, l.numero, l.nom));
  const aVenirFiltre = aVenir.filter((c) => commandeCorrespond(recherche, c.numero, c.nom));

  const enAttente = commandesFiltrees.filter((c) => c.statut === "en_attente");
  const enPreparation = commandesFiltrees.filter((c) => c.statut === "en_preparation");
  const prete = commandesFiltrees.filter((c) => c.statut === "pret");

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span className="text-lg text-black">
          {employeActif ? (
            <>
              Employé actif : <b>{employeActif.nom}</b>
            </>
          ) : (
            "Aucun employé identifié"
          )}
        </span>
        <button
          onClick={changerEmploye}
          className="rounded bg-[#8B2020] px-4 py-2 text-sm font-semibold text-white"
        >
          Changer d&apos;employé
        </button>
      </div>

      {erreur && <p className="mb-3 text-lg text-red-600">{erreur}</p>}

      <div className="mb-4">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par numéro et/ou nom du client…"
          className="w-full max-w-md rounded border border-gray-300 p-2 text-lg text-gray-900"
        />
        {recherche.trim() && (
          <button
            type="button"
            onClick={() => setRecherche("")}
            className="ml-2 text-sm text-gray-500 underline"
          >
            Effacer
          </button>
        )}
      </div>

      {commandes.length === 0 && enLivraison.length === 0 && (
        <p className="text-xl text-gray-400">Aucune commande en cours.</p>
      )}
      {commandes.length > 0 &&
        recherche.trim() &&
        enAttente.length === 0 &&
        enPreparation.length === 0 &&
        prete.length === 0 &&
        enLivraisonFiltree.length === 0 && <p className="text-xl text-gray-400">Aucune commande ne correspond.</p>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Colonne titre="En attente" count={enAttente.length}>
          {enAttente.map((commande) => (
            <CarteCommande
              key={commande.id}
              commande={commande}
              demanderChangement={demanderChangement}
              demanderAnnulation={demanderAnnulation}
            />
          ))}
        </Colonne>
        <Colonne titre="En préparation" count={enPreparation.length}>
          {enPreparation.map((commande) => (
            <CarteCommande
              key={commande.id}
              commande={commande}
              demanderChangement={demanderChangement}
              demanderAnnulation={demanderAnnulation}
            />
          ))}
        </Colonne>
        <Colonne titre="Prête" count={prete.length}>
          {prete.map((commande) => (
            <CarteCommande
              key={commande.id}
              commande={commande}
              demanderChangement={demanderChangement}
              demanderAnnulation={demanderAnnulation}
            />
          ))}
        </Colonne>
        <Colonne titre="En cours de livraison" count={enLivraisonFiltree.length}>
          {enLivraisonFiltree.map((livraison) => (
            <CarteLivraisonEnCours key={livraison.id} livraison={livraison} resoudreLivraison={resoudreLivraison} />
          ))}
        </Colonne>
      </div>

      {aVenirFiltre.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-xl font-bold text-gray-700">Commandes à venir</h2>
          <div className="space-y-2">
            {aVenirFiltre.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-lg text-gray-700">
                Commande à venir — {formaterDateHeureComplete(c.heureSouhaitee)} — #{c.numero} — {c.nbPlats} plat
                {c.nbPlats > 1 ? "s" : ""}
                {c.statut === "en_attente" && (
                  <div className="mt-2 flex gap-2">
                    <a
                      href={`/caisse?modifier=${c.id}`}
                      className="flex-1 rounded border border-gray-400 py-2 text-center text-base font-semibold text-gray-700"
                    >
                      Modifier
                    </a>
                    <button
                      onClick={() => demanderAnnulation(c.id)}
                      className="flex-1 rounded border border-red-600 py-2 text-base font-semibold text-red-600"
                    >
                      Annuler la commande
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOuverte && (
        <IdentificationModal
          onValide={(identite) => {
            definirEmployeActif(identite);
            setModalOuverte(false);
            actionEnAttente?.(identite);
            setActionEnAttente(null);
          }}
          onAnnuler={() => {
            setModalOuverte(false);
            setActionEnAttente(null);
          }}
        />
      )}
    </div>
  );
}
