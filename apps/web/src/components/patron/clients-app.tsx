"use client";

import { useMemo, useState } from "react";
import type { ClientAdmin, CommandeClientAdmin } from "@/lib/patron/clients";
import { MONTANT_RECOMPENSE, SEUIL_RECOMPENSE, messageFidelite } from "@/lib/fidelite/regles";

interface ClientsAppProps {
  clientsInitiaux: ClientAdmin[];
}

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Mayotte", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

function nomAffiche(c: ClientAdmin): string {
  const complet = [c.prenom, c.nom].filter(Boolean).join(" ");
  return complet || "Nom inconnu";
}

/**
 * Fiche client fidélité — répond à "où est-ce que je vois les clients et
 * leurs tampons ?" et à "une cliente s'est trompée de numéro, elle n'a plus
 * accès à ses tampons". Chaque fiche est dépliable : identité éditable
 * (corrige un numéro mal saisi sans perdre l'historique, cf.
 * corriger_telephone_client côté DB), historique de commandes chargé à la
 * demande. Les tampons/récompenses restent entièrement calculés
 * automatiquement par la base à chaque paiement — jamais modifiables ici.
 */
export function ClientsApp({ clientsInitiaux }: ClientsAppProps) {
  const [clients, setClients] = useState(clientsInitiaux);
  const [recherche, setRecherche] = useState("");
  const [telephoneOuvert, setTelephoneOuvert] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ prenom: string; nom: string; telephone: string } | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [historiques, setHistoriques] = useState<Record<string, CommandeClientAdmin[] | "chargement" | "erreur">>({});

  const clientsFiltres = useMemo(() => {
    // Les numéros stockés sont toujours en E.164 (+262639..., jamais de 0
    // local) — un client qui tape "0639..." comme il en a l'habitude ne
    // trouverait sinon jamais rien. On matche aussi sur le nom/prénom.
    const requete = recherche.trim().toLowerCase();
    const requeteTelephone = requete.replace(/[\s.\-()]/g, "").replace(/^0/, "");
    if (!requete) return clients;
    return clients.filter(
      (c) =>
        c.telephone.includes(requeteTelephone) ||
        (c.nom ?? "").toLowerCase().includes(requete) ||
        (c.prenom ?? "").toLowerCase().includes(requete)
    );
  }, [clients, recherche]);

  const nbRecompensesDisponibles = clients.filter((c) => c.recompenseDisponible).length;

  function ouvrirFiche(c: ClientAdmin) {
    if (telephoneOuvert === c.telephone) {
      setTelephoneOuvert(null);
      setEdition(null);
      setErreurEdition(null);
      return;
    }
    setTelephoneOuvert(c.telephone);
    setEdition({ prenom: c.prenom ?? "", nom: c.nom ?? "", telephone: c.telephone });
    setErreurEdition(null);
  }

  async function chargerHistorique(telephone: string) {
    if (historiques[telephone] && historiques[telephone] !== "erreur") return;
    setHistoriques((h) => ({ ...h, [telephone]: "chargement" }));
    try {
      const reponse = await fetch(`/api/patron/clients?telephone=${encodeURIComponent(telephone)}`);
      if (!reponse.ok) throw new Error();
      const data = await reponse.json();
      setHistoriques((h) => ({ ...h, [telephone]: data.commandes }));
    } catch {
      setHistoriques((h) => ({ ...h, [telephone]: "erreur" }));
    }
  }

  async function enregistrer(ancienTelephone: string) {
    if (!edition) return;
    setErreurEdition(null);
    if (!edition.prenom.trim() || !edition.nom.trim() || !edition.telephone.trim()) {
      setErreurEdition("Prénom, nom et téléphone sont obligatoires.");
      return;
    }
    setEnregistrementEnCours(true);
    try {
      const reponse = await fetch("/api/patron/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telephone: ancienTelephone,
          nouveauTelephone: edition.telephone.trim() !== ancienTelephone ? edition.telephone.trim() : undefined,
          prenom: edition.prenom.trim(),
          nom: edition.nom.trim(),
        }),
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        setErreurEdition(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      setClients((prev) =>
        prev.map((c) =>
          c.telephone === ancienTelephone
            ? { ...c, telephone: edition.telephone.trim(), prenom: edition.prenom.trim(), nom: edition.nom.trim() }
            : c
        )
      );
      setTelephoneOuvert(edition.telephone.trim());
    } catch {
      setErreurEdition("Erreur réseau, réessaie.");
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h2 className="text-lg font-bold">Clients fidélité</h2>
      <p className="text-xs text-gray-500">
        {MONTANT_RECOMPENSE}€ dépensés = 1 tampon. {SEUIL_RECOMPENSE / MONTANT_RECOMPENSE} tampons = {MONTANT_RECOMPENSE}€
        offerts. Calculé automatiquement à chaque paiement (comptoir, livraison, site) — rien à saisir ici.
      </p>

      <div className="flex gap-4 rounded border border-gray-300 p-3 text-sm">
        <div>
          <p className="text-gray-500">Clients</p>
          <p className="text-lg font-bold">{clients.length}</p>
        </div>
        <div>
          <p className="text-gray-500">Récompenses disponibles</p>
          <p className="text-lg font-bold">{nbRecompensesDisponibles}</p>
        </div>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par numéro, nom ou prénom"
        className="w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
      />

      {clientsFiltres.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun client trouvé.</p>
      ) : (
        <ul className="space-y-2">
          {clientsFiltres.map((c) => {
            const ouvert = telephoneOuvert === c.telephone;
            const historique = historiques[c.telephone];
            return (
              <li key={c.telephone} className="rounded border border-gray-200 text-sm">
                <button
                  type="button"
                  onClick={() => ouvrirFiche(c)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{nomAffiche(c)}</p>
                    <p className="text-xs text-gray-500">{c.telephone}</p>
                  </div>
                  <span className="font-bold text-gray-900">{c.montantCumule.toFixed(2)} €</span>
                </button>

                {!ouvert && (
                  <div className="flex items-center justify-between px-3 pb-3 text-xs text-gray-500">
                    <span>
                      {"🎁".repeat(Math.min(c.tamponsAcquis, 10))}
                      {c.tamponsAcquis > 10 ? ` +${c.tamponsAcquis - 10}` : ""}
                      {c.tamponsAcquis === 0 && "Aucun tampon pour l'instant"}
                    </span>
                    {c.dateExpiration && <span>Expire le {formaterDate(c.dateExpiration)}</span>}
                  </div>
                )}

                {ouvert && (
                  <div className="space-y-3 border-t border-gray-200 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {"🎁".repeat(Math.min(c.tamponsAcquis, 10))}
                        {c.tamponsAcquis > 10 ? ` +${c.tamponsAcquis - 10}` : ""}
                        {c.tamponsAcquis === 0 && "Aucun tampon pour l'instant"}
                      </span>
                      {c.dateExpiration && <span>Expire le {formaterDate(c.dateExpiration)}</span>}
                    </div>

                    {c.recompenseDisponible ? (
                      <p className="text-xs font-bold text-[#2D5A27]">🎁 Récompense de {MONTANT_RECOMPENSE}€ disponible !</p>
                    ) : (
                      <p className="text-xs text-gray-400">
                        {messageFidelite({ montantCumule: c.montantCumule, recompenseDisponible: false })}
                      </p>
                    )}

                    <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-xs font-semibold text-gray-700">Corriger la fiche</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={edition?.prenom ?? ""}
                          onChange={(e) => setEdition((ed) => (ed ? { ...ed, prenom: e.target.value } : ed))}
                          placeholder="Prénom"
                          className="rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
                        />
                        <input
                          value={edition?.nom ?? ""}
                          onChange={(e) => setEdition((ed) => (ed ? { ...ed, nom: e.target.value } : ed))}
                          placeholder="Nom"
                          className="rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
                        />
                      </div>
                      <input
                        value={edition?.telephone ?? ""}
                        onChange={(e) => setEdition((ed) => (ed ? { ...ed, telephone: e.target.value } : ed))}
                        placeholder="Téléphone (+262...)"
                        className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
                      />
                      <p className="text-xs text-gray-400">
                        Changer le téléphone déplace ses commandes et son historique fidélité vers le nouveau numéro.
                      </p>
                      {erreurEdition && <p className="text-xs text-red-600">{erreurEdition}</p>}
                      <button
                        type="button"
                        onClick={() => enregistrer(c.telephone)}
                        disabled={enregistrementEnCours}
                        className="w-full rounded bg-[#8B2020] py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
                      </button>
                    </div>

                    <div>
                      {!historique && (
                        <button
                          type="button"
                          onClick={() => chargerHistorique(c.telephone)}
                          className="text-xs font-semibold text-[#8B2020] underline"
                        >
                          Voir les commandes
                        </button>
                      )}
                      {historique === "chargement" && <p className="text-xs text-gray-400">Chargement…</p>}
                      {historique === "erreur" && <p className="text-xs text-red-600">Impossible de charger l&apos;historique.</p>}
                      {Array.isArray(historique) && (
                        <ul className="space-y-1">
                          {historique.length === 0 && <p className="text-xs text-gray-400">Aucune commande.</p>}
                          {historique.map((cmd) => (
                            <li key={cmd.id} className="flex items-center justify-between text-xs text-gray-600">
                              <span>
                                #{cmd.numero} · {formaterDate(cmd.creeLe)} · {cmd.canal} · {cmd.statut}
                              </span>
                              <span className="font-semibold">{cmd.montant.toFixed(2)} €</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
