"use client";

import { useRef, useState } from "react";
import {
  CATEGORIES_DEPENSE,
  MODES_PAIEMENT_DEPENSE,
  OBJECTIF_MARGE_BRUTE,
  libelleCategorie,
  type LigneDepense,
} from "@/lib/depenses-categories";
import type { DonneesDepenses, DepenseAdmin } from "@/lib/patron/depenses";

interface LigneForm {
  designation: string;
  quantite: string;
  unite: string;
  prixUnitaire: string;
  montant: string;
}

interface FormDepense {
  id: string | null;
  date: string;
  fournisseur: string;
  description: string;
  categorie: string;
  montant: string;
  modePaiement: string;
  lignes: LigneForm[];
  factureChemin: string | null;
}

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const versNombre = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const texteNombre = (n: number | null) => (n === null ? "" : String(n));
const libelleMois = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  const l = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
  return l.charAt(0).toUpperCase() + l.slice(1);
};
const libelleDate = (iso: string) => iso.split("-").reverse().join("/");

const FORM_VIDE = (date: string): FormDepense => ({
  id: null,
  date,
  fournisseur: "",
  description: "",
  categorie: "viande",
  montant: "",
  modePaiement: "",
  lignes: [],
  factureChemin: null,
});

/** Réduit une photo de téléphone (plusieurs Mo) à ~400 Ko avant l'envoi ; les PDF partent tels quels. */
async function reduirePhoto(fichier: File): Promise<File> {
  if (!fichier.type.startsWith("image/")) return fichier;
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], "facture.jpg", { type: "image/jpeg" }) : fichier;
  } catch {
    return fichier;
  }
}

const CATEGORIES_CHARGES_FIXES = ["loyer", "salaires", "assurance_banque_comptable", "carburant_transport"];

function moisPrecedent(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

interface PrixAchat {
  designation: string;
  fournisseur: string | null;
  date: string;
  prixUnitaire: number;
  unite: string | null;
  nbAchats: number;
}

/** Dernier prix d'achat relevé par article (ligne de facture), pour calculer plus tard le coût de chaque plat. */
function prixAchatsReleves(depenses: DepenseAdmin[]): PrixAchat[] {
  const parArticle = new Map<string, PrixAchat>();
  for (const d of depenses) {
    for (const l of d.lignes) {
      const prix = l.prixUnitaire ?? (l.quantite ? l.montant / l.quantite : null);
      if (prix === null || !Number.isFinite(prix)) continue;
      const cle = l.designation.trim().toLowerCase();
      const existant = parArticle.get(cle);
      if (!existant) {
        parArticle.set(cle, { designation: l.designation.trim(), fournisseur: d.fournisseur, date: d.dateDepense, prixUnitaire: prix, unite: l.unite, nbAchats: 1 });
      } else {
        existant.nbAchats += 1;
        if (d.dateDepense > existant.date) Object.assign(existant, { fournisseur: d.fournisseur, date: d.dateDepense, prixUnitaire: prix, unite: l.unite });
      }
    }
  }
  return [...parArticle.values()].sort((a, b) => a.designation.localeCompare(b.designation, "fr"));
}

export function DepensesApp({
  initial,
  moisInitial,
  aujourdHui,
  erreurInitiale,
}: {
  initial: DonneesDepenses | null;
  moisInitial: string;
  aujourdHui: string;
  erreurInitiale: string | null;
}) {
  const [mois, setMois] = useState(moisInitial);
  const [donnees, setDonnees] = useState<DonneesDepenses | null>(initial);
  const [erreur, setErreur] = useState<string | null>(erreurInitiale);
  const [form, setForm] = useState<FormDepense | null>(null);
  const [lecture, setLecture] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [lignesOuvertes, setLignesOuvertes] = useState(false);
  const champFichier = useRef<HTMLInputElement>(null);

  async function charger(nouveauMois: string) {
    setMois(nouveauMois);
    try {
      const reponse = await fetch(`/api/patron/depenses?mois=${nouveauMois}`, { cache: "no-store" });
      const data = await reponse.json();
      if (!reponse.ok) throw new Error(data.error);
      setDonnees(data);
      setErreur(null);
    } catch {
      setErreur("Chargement impossible.");
    }
  }

  async function reprendreChargesFixes() {
    const precedent = moisPrecedent(mois);
    setErreur(null);
    setEnregistrement(true);
    try {
      const reponse = await fetch(`/api/patron/depenses?mois=${precedent}`, { cache: "no-store" });
      const data = (await reponse.json()) as DonneesDepenses & { error?: string };
      if (!reponse.ok) throw new Error(data.error);
      const aReprendre = data.depenses.filter((d) => CATEGORIES_CHARGES_FIXES.includes(d.categorie));
      if (aReprendre.length === 0) {
        setErreur("Aucune charge fixe (loyer, salaires, assurance/abonnements, location de véhicule) le mois dernier.");
        return;
      }
      for (const d of aReprendre) {
        const envoi = await fetch("/api/patron/depenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateDepense: `${mois}-01`,
            fournisseur: d.fournisseur,
            description: d.description,
            categorie: d.categorie,
            montant: d.montant,
            modePaiement: d.modePaiement,
            lignes: [],
            factureChemin: null,
          }),
        });
        if (!envoi.ok) throw new Error("envoi");
      }
      await charger(mois);
    } catch {
      setErreur("Reprise impossible, réessaie.");
    } finally {
      setEnregistrement(false);
    }
  }

  async function lireFacture(fichier: File) {
    setErreur(null);
    setAvertissement(null);
    setLecture(true);
    try {
      const reduit = await reduirePhoto(fichier);
      const corps = new FormData();
      corps.append("fichier", reduit);
      const reponse = await fetch("/api/patron/depenses/extraire", { method: "POST", body: corps });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Envoi impossible.");
        return;
      }
      const e = data.extraction;
      setForm({
        ...FORM_VIDE(e?.date ?? aujourdHui),
        fournisseur: e?.fournisseur ?? "",
        description: e?.description ?? "",
        categorie: e?.categorie ?? "autre",
        montant: texteNombre(e?.montantTotal ?? null),
        modePaiement: e?.modePaiement ?? "",
        lignes: ((e?.lignes ?? []) as LigneDepense[]).map((l) => ({
          designation: l.designation,
          quantite: texteNombre(l.quantite),
          unite: l.unite ?? "",
          prixUnitaire: texteNombre(l.prixUnitaire),
          montant: texteNombre(l.montant),
        })),
        factureChemin: data.chemin,
      });
      setLignesOuvertes(false);
      if (data.avertissement) setAvertissement(data.avertissement);
    } catch {
      setErreur("Envoi impossible. Vérifie ta connexion.");
    } finally {
      setLecture(false);
      if (champFichier.current) champFichier.current.value = "";
    }
  }

  function modifier(d: DepenseAdmin) {
    setAvertissement(null);
    setLignesOuvertes(false);
    setForm({
      id: d.id,
      date: d.dateDepense,
      fournisseur: d.fournisseur ?? "",
      description: d.description ?? "",
      categorie: d.categorie,
      montant: texteNombre(d.montant),
      modePaiement: d.modePaiement ?? "",
      lignes: d.lignes.map((l) => ({
        designation: l.designation,
        quantite: texteNombre(l.quantite),
        unite: l.unite ?? "",
        prixUnitaire: texteNombre(l.prixUnitaire),
        montant: texteNombre(l.montant),
      })),
      factureChemin: null,
    });
  }

  async function enregistrer() {
    if (!form) return;
    const montant = versNombre(form.montant);
    if (montant === null) {
      setErreur("Indique le montant total.");
      return;
    }
    setErreur(null);
    setEnregistrement(true);
    try {
      const lignes = form.lignes
        .map((l) => ({
          designation: l.designation.trim(),
          quantite: versNombre(l.quantite),
          unite: l.unite.trim() || null,
          prixUnitaire: versNombre(l.prixUnitaire),
          montant: versNombre(l.montant),
        }))
        .filter((l) => l.designation && l.montant !== null);
      const reponse = await fetch("/api/patron/depenses", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id ?? undefined,
          dateDepense: form.date,
          fournisseur: form.fournisseur,
          description: form.description,
          categorie: form.categorie,
          montant,
          modePaiement: form.modePaiement || null,
          lignes,
          factureChemin: form.factureChemin,
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreur(data.error ?? "Enregistrement impossible.");
        return;
      }
      const moisDepense = form.date.slice(0, 7);
      setForm(null);
      await charger(moisDepense);
    } catch {
      setErreur("Enregistrement impossible. Vérifie ta connexion.");
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(d: DepenseAdmin) {
    if (!window.confirm(`Supprimer ${euros(d.montant)} — ${d.fournisseur ?? libelleCategorie(d.categorie)} ? Cette action est définitive.`)) return;
    const reponse = await fetch(`/api/patron/depenses?id=${d.id}`, { method: "DELETE" });
    if (!reponse.ok) {
      setErreur("Suppression impossible.");
      return;
    }
    await charger(mois);
  }

  function majLigne(index: number, champ: keyof LigneForm, valeur: string) {
    setForm((f) => (f ? { ...f, lignes: f.lignes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)) } : f));
  }

  const resume = donnees?.resume;
  const resultat = resume ? resume.ventes - resume.totalDepenses : 0;
  const sommeLignes = form ? form.lignes.reduce((t, l) => t + (versNombre(l.montant) ?? 0), 0) : 0;
  const montantForm = form ? versNombre(form.montant) : null;
  const ecartLignes = form && form.lignes.length > 0 && montantForm !== null && Math.abs(sommeLignes - montantForm) > 0.05;
  const champ = "mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900";

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-black">Dépenses — {libelleMois(mois)}</h2>
          <input
            type="month"
            value={mois}
            onChange={(e) => e.target.value && charger(e.target.value)}
            className="rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
          />
        </div>
        {erreur && <p className="mt-2 rounded bg-red-50 p-2 text-sm font-semibold text-red-700">{erreur}</p>}
        {resume && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600">Ventes encaissées ({resume.nbCommandes} commandes)</p>
              <p className="text-xl font-extrabold text-[#2D5A27]">{euros(resume.ventes)}</p>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600">Dépenses enregistrées</p>
              <p className="text-xl font-extrabold text-[#8B2020]">{euros(resume.totalDepenses)}</p>
              <p className="text-xs text-gray-600">dont achats de produits : {euros(resume.totalAchats)}</p>
            </div>
            <div className={`rounded border-2 p-3 ${resultat >= 0 ? "border-[#2D5A27]" : "border-[#8B2020]"}`}>
              <p className="text-xs font-semibold text-gray-600">Ce qu&apos;il reste (ventes − dépenses)</p>
              <p className={`text-xl font-extrabold ${resultat >= 0 ? "text-[#2D5A27]" : "text-[#8B2020]"}`}>{euros(resultat)}</p>
              {resume.ventes > 0 && resume.totalAchats > 0 && (
                <p className="text-xs text-gray-600">achats = {Math.round((resume.totalAchats / resume.ventes) * 100)} % des ventes</p>
              )}
            </div>
          </div>
        )}
        {resume && resume.ventes > 0 && (
          <div className="mt-2 rounded border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600">
              Marge brute (ventes − produits, emballages, gaz/eau/électricité, salaires, livraison)
            </p>
            {(() => {
              const marge = Math.round(((resume.ventes - resume.totalCoutsDirects) / resume.ventes) * 100);
              const ok = marge >= OBJECTIF_MARGE_BRUTE;
              return (
                <p className={`text-xl font-extrabold ${ok ? "text-[#2D5A27]" : "text-[#8B2020]"}`}>
                  {marge} % <span className="text-xs font-semibold text-gray-600">(objectif {OBJECTIF_MARGE_BRUTE} %) — coûts directs {euros(resume.totalCoutsDirects)}</span>
                </p>
              );
            })()}
            <p className="text-xs text-gray-600">Fiable seulement quand toutes les factures du mois sont saisies.</p>
          </div>
        )}
        {resume && resume.parCategorie.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {resume.parCategorie.map((c) => (
              <li key={c.categorie} className="flex justify-between py-1 text-sm text-black">
                <span>{libelleCategorie(c.categorie)}</span>
                <span className="font-bold">{euros(c.montant)}</span>
              </li>
            ))}
          </ul>
        )}
        {resume && resume.totalDepenses === 0 && !erreur && (
          <p className="mt-2 text-sm text-gray-600">Aucune dépense enregistrée ce mois-ci : le « reste » ci-dessus n&apos;est pas fiable tant que tes factures ne sont pas saisies.</p>
        )}
      </section>

      {!form && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-bold text-black">Ajouter une dépense</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={champFichier}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && lireFacture(e.target.files[0])}
            />
            <button
              type="button"
              disabled={lecture}
              onClick={() => champFichier.current?.click()}
              className="rounded bg-[#8B2020] px-4 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              {lecture ? "Lecture de la facture…" : "📷 Photographier une facture"}
            </button>
            <button
              type="button"
              disabled={lecture}
              onClick={() => {
                setAvertissement(null);
                setForm(FORM_VIDE(aujourdHui));
              }}
              className="rounded border border-gray-400 px-4 py-3 text-base font-bold text-gray-900 disabled:opacity-50"
            >
              Saisir sans photo
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">La photo (ou le PDF) est lue automatiquement. Tu relis, tu corriges si besoin, puis tu enregistres.</p>
        </section>
      )}

      {form && (
        <section className="space-y-3 rounded-lg border-2 border-[#8B2020] bg-white p-4">
          <h2 className="text-lg font-bold text-black">{form.id ? "Modifier la dépense" : "Vérifie et enregistre"}</h2>
          {avertissement && <p className="rounded bg-orange-50 p-2 text-sm font-semibold text-orange-800">{avertissement}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-900">
              Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={champ} />
            </label>
            <label className="text-sm font-semibold text-gray-900">
              Fournisseur
              <input value={form.fournisseur} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })} className={champ} />
            </label>
            <label className="text-sm font-semibold text-gray-900">
              Catégorie
              <select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} className={champ}>
                {CATEGORIES_DEPENSE.map((c) => (
                  <option key={c.valeur} value={c.valeur}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-gray-900">
              Montant total (€)
              <input value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} inputMode="decimal" className={champ} />
            </label>
            <label className="text-sm font-semibold text-gray-900">
              Payé par
              <select value={form.modePaiement} onChange={(e) => setForm({ ...form, modePaiement: e.target.value })} className={champ}>
                <option value="">Non précisé</option>
                {MODES_PAIEMENT_DEPENSE.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-gray-900">
              Description
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={champ} />
            </label>
          </div>

          <div>
            <button type="button" onClick={() => setLignesOuvertes((o) => !o)} className="text-sm font-bold text-gray-900 underline">
              {lignesOuvertes ? "Masquer" : "Voir"} le détail des articles ({form.lignes.length})
            </button>
            {ecartLignes && (
              <p className="mt-1 text-sm font-semibold text-orange-800">
                Les articles totalisent {euros(sommeLignes)} alors que le total est {euros(montantForm ?? 0)} : vérifie (remise, transport, TVA…).
              </p>
            )}
            {lignesOuvertes && (
              <div className="mt-2 space-y-2">
                {form.lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 items-end gap-1 rounded border border-gray-200 p-2">
                    <input aria-label="Article" value={l.designation} onChange={(e) => majLigne(i, "designation", e.target.value)} placeholder="Article" className="col-span-12 rounded border border-gray-300 p-1 text-sm text-gray-900 sm:col-span-5" />
                    <input aria-label="Quantité" value={l.quantite} onChange={(e) => majLigne(i, "quantite", e.target.value)} placeholder="Qté" inputMode="decimal" className="col-span-3 rounded border border-gray-300 p-1 text-sm text-gray-900 sm:col-span-2" />
                    <input aria-label="Unité" value={l.unite} onChange={(e) => majLigne(i, "unite", e.target.value)} placeholder="Unité" className="col-span-3 rounded border border-gray-300 p-1 text-sm text-gray-900 sm:col-span-1" />
                    <input aria-label="Prix unitaire" value={l.prixUnitaire} onChange={(e) => majLigne(i, "prixUnitaire", e.target.value)} placeholder="Prix unit." inputMode="decimal" className="col-span-3 rounded border border-gray-300 p-1 text-sm text-gray-900 sm:col-span-2" />
                    <input aria-label="Montant" value={l.montant} onChange={(e) => majLigne(i, "montant", e.target.value)} placeholder="Montant" inputMode="decimal" className="col-span-2 rounded border border-gray-300 p-1 text-sm text-gray-900 sm:col-span-1" />
                    <button type="button" aria-label="Retirer l'article" onClick={() => setForm({ ...form, lignes: form.lignes.filter((_, j) => j !== i) })} className="col-span-1 text-lg font-bold text-[#8B2020]">
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, lignes: [...form.lignes, { designation: "", quantite: "", unite: "", prixUnitaire: "", montant: "" }] })}
                  className="text-sm font-bold text-gray-900 underline"
                >
                  + Ajouter un article
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={enregistrement} onClick={enregistrer} className="rounded bg-[#2D5A27] px-5 py-3 text-base font-bold text-white disabled:opacity-50">
              {enregistrement ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              disabled={enregistrement}
              onClick={() => {
                setForm(null);
                setAvertissement(null);
              }}
              className="rounded border border-gray-400 px-5 py-3 text-base font-bold text-gray-900"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {donnees && !donnees.depenses.some((d) => CATEGORIES_CHARGES_FIXES.includes(d.categorie)) && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">Aucune charge fixe saisie ce mois (loyer, salaires, assurance/abonnements, véhicule).</p>
          <button
            type="button"
            onClick={reprendreChargesFixes}
            disabled={enregistrement}
            className="mt-2 rounded border border-gray-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Reprendre celles du mois dernier
          </button>
          <p className="mt-1 text-xs text-gray-500">Elles sont recopiées au 1er du mois : tu corriges ensuite les montants qui changent.</p>
        </section>
      )}

      {donnees && prixAchatsReleves(donnees.depenses).length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-bold text-black">Prix d&apos;achat relevés</h2>
          <p className="text-xs text-gray-600">Dernier prix payé par article, lu sur les factures : la base pour calculer ce que coûte chaque plat.</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {prixAchatsReleves(donnees.depenses).map((p) => (
              <li key={p.designation} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm text-black">
                <span className="font-semibold">{p.designation}</span>
                <span className="text-gray-600">
                  {euros(p.prixUnitaire)}
                  {p.unite ? ` / ${p.unite}` : ""} · {p.fournisseur ?? "?"} · {libelleDate(p.date)}
                  {p.nbAchats > 1 ? ` · ${p.nbAchats} achats` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold text-black">Liste du mois ({donnees?.depenses.length ?? 0})</h2>
        {donnees && donnees.depenses.length === 0 && <p className="mt-1 text-sm text-gray-600">Rien pour l&apos;instant.</p>}
        <ul className="mt-2 divide-y divide-gray-100">
          {(donnees?.depenses ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-black">
              <div className="min-w-0">
                <p className="font-bold">
                  {libelleDate(d.dateDepense)} · {d.fournisseur ?? "Sans fournisseur"}
                </p>
                <p className="text-gray-600">
                  {libelleCategorie(d.categorie)}
                  {d.description ? ` — ${d.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-[#8B2020]">{euros(d.montant)}</span>
                {d.aFacture && (
                  <a href={`/api/patron/depenses/facture?id=${d.id}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                    Facture
                  </a>
                )}
                <button type="button" onClick={() => modifier(d)} className="font-semibold underline">
                  Modifier
                </button>
                <button type="button" onClick={() => supprimer(d)} className="font-semibold text-[#8B2020] underline">
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
