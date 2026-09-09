"use client";

import { useEffect, useRef, useState } from "react";
import type { CommandeCuisine, LivreurActif } from "@/lib/cuisine/types";
import { LIBELLES_STATUT, TRANSITIONS_PAR_CANAL } from "@/lib/cuisine/types";
import { jouerAlerteSonore } from "@/lib/impression/alerte-sonore";
import { IdentificationModal } from "./identification-modal";

interface CommandesAppProps {
  commandesInitiales: CommandeCuisine[];
  livreursActifs: LivreurActif[];
}

const INTERVALLE_POLLING_MS = 5000;
const INACTIVITE_LIMITE_MS = 10 * 60 * 1000;
const CLE_EMPLOYE_ACTIF = "cuisine_employe_actif";

interface EmployeActif {
  profilId: string;
  nom: string;
}

function libelleCanal(canal: CommandeCuisine["canal"]): string {
  if (canal === "livraison") return "Livraison";
  if (canal === "emporter") return "À emporter";
  return "Sur place";
}

function formaterHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
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
  return details;
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

export function CommandesApp({ commandesInitiales, livreursActifs }: CommandesAppProps) {
  const [commandes, setCommandes] = useState<CommandeCuisine[]>(commandesInitiales);
  const [employeActif, setEmployeActif] = useState<EmployeActif | null>(() => lireIdentitePersistee().identite);
  const [modalOuverte, setModalOuverte] = useState(false);
  const [actionEnAttente, setActionEnAttente] = useState<((identite: EmployeActif) => void) | null>(null);
  const [livreurChoisi, setLivreurChoisi] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const idsVusRef = useRef<Set<string>>(new Set(commandesInitiales.map((c) => c.id)));
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
  // uniquement pour un id jamais vu depuis l'ouverture de la page.
  useEffect(() => {
    let annule = false;

    async function verifier() {
      try {
        const reponse = await fetch("/api/cuisine/commandes", { cache: "no-store" });
        if (!reponse.ok || annule) return;
        const data = await reponse.json();
        const nouvellesCommandes: CommandeCuisine[] = data.commandes ?? [];

        const idsNouveaux = nouvellesCommandes.filter((c) => !idsVusRef.current.has(c.id));
        if (idsNouveaux.length > 0) {
          jouerAlerteSonore();
          for (const c of idsNouveaux) idsVusRef.current.add(c.id);
        }

        if (!annule) setCommandes(nouvellesCommandes);
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
    } catch {
      // ignore, le polling reprendra
    }
  }

  async function appliquerChangement(commandeId: string, statut: string, profilId: string, livreurId?: string) {
    setErreur(null);
    const reponse = await fetch("/api/cuisine/commandes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandeId, statut, profilId, livreurId }),
    });
    if (!reponse.ok) {
      const data = await reponse.json().catch(() => ({}));
      setErreur(data.error ?? "Échec du changement de statut.");
      return;
    }
    await rafraichir();
  }

  function demanderChangement(commandeId: string, statut: string, livreurId?: string) {
    const executer = (identite: EmployeActif) => {
      appliquerChangement(commandeId, statut, identite.profilId, livreurId);
    };

    if (employeActif) {
      executer(employeActif);
      return;
    }
    setActionEnAttente(() => executer);
    setModalOuverte(true);
  }

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

      {commandes.length === 0 && <p className="text-xl text-gray-400">Aucune commande en cours.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {commandes.map((commande) => {
          const statutSuivant = TRANSITIONS_PAR_CANAL[commande.canal]?.[commande.statut];
          const demandeLivreur = statutSuivant === "pris_par_livreur";
          const livreurSelectionne = livreurChoisi[commande.id] ?? "";

          return (
            <div key={commande.id} className="rounded-xl border-2 border-gray-200 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-black">Commande #{commande.numero}</span>
                <span className="text-xl text-black">{formaterHeure(commande.heureSouhaitee)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded bg-gray-200 px-2 py-1 text-lg font-semibold text-black">
                  {libelleCanal(commande.canal)}
                </span>
                <span className="text-lg text-black">{LIBELLES_STATUT[commande.statut]}</span>
              </div>
              {commande.canal === "livraison" && commande.adresse && (
                <p className="mt-1 text-lg text-black">Adresse : {commande.adresse}</p>
              )}

              <ul className="mt-3 space-y-2">
                {commande.lignes.map((ligne, i) => (
                  <li key={i} className="text-xl text-black">
                    <span className="font-semibold">
                      {ligne.quantite}x {ligne.nom}
                    </span>
                    {detailLigne(ligne).map((detail, j) => (
                      <div key={j} className="text-lg text-gray-700">
                        {detail}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>

              {statutSuivant && (
                <div className="mt-4 space-y-2">
                  {demandeLivreur && (
                    <select
                      value={livreurSelectionne}
                      onChange={(e) => setLivreurChoisi((prec) => ({ ...prec, [commande.id]: e.target.value }))}
                      className="w-full rounded border border-gray-300 p-3 text-lg text-black"
                    >
                      <option value="">Choisir le livreur…</option>
                      {livreursActifs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nom}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => demanderChangement(commande.id, statutSuivant, demandeLivreur ? livreurSelectionne : undefined)}
                    disabled={demandeLivreur && !livreurSelectionne}
                    className="w-full rounded bg-[#8B2020] py-3 text-xl font-bold text-white disabled:opacity-40"
                  >
                    {LIBELLES_STATUT[statutSuivant]}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
