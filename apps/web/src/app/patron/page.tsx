import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PasswordForm } from "@/components/auth/password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProduitsApp } from "@/components/patron/produits-app";
import { OptionsApp } from "@/components/patron/options-app";
import { ImprimantesApp } from "@/components/patron/imprimantes-app";
import { TerminauxSumupApp } from "@/components/patron/terminaux-sumup-app";
import { CommandesHistoriqueApp } from "@/components/patron/commandes-historique-app";
import { EncaissementsLivraisonApp } from "@/components/patron/encaissements-livraison-app";
import { EncaissementsJourApp } from "@/components/patron/encaissements-jour-app";
import { StatistiquesJourApp } from "@/components/patron/statistiques-jour-app";
import { ClientsApp } from "@/components/patron/clients-app";
import { PatronTabs } from "@/components/patron/patron-tabs";
import { EtatSiteApp } from "@/components/patron/etat-site-app";
import { LivraisonActiveApp } from "@/components/patron/livraison-active-app";
import { JoursFermetureApp } from "@/components/patron/jours-fermeture-app";
import { RemiseLancementApp } from "@/components/patron/remise-lancement-app";
import { MessageMomentApp } from "@/components/patron/message-moment-app";
import { GroupeMetriquesApp } from "@/components/patron/groupe-metriques-app";
import { listerProduitsAdmin } from "@/lib/patron/produits";
import { calculerMetriquesGroupe } from "@/lib/patron/groupe-metriques";
import {
  chargerEtatSite,
  chargerJoursFermeture,
  chargerRemiseLancement,
  chargerMessageDuMoment,
  chargerLivraisonActive,
} from "@/lib/patron/parametres";
import { listerOptionsAdmin } from "@/lib/patron/options";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";
import { listerTerminauxSumupAdmin } from "@/lib/patron/terminaux-sumup";
import { listerHistoriqueCommandes, calculerTempsPreparationMoyenParEmploye } from "@/lib/patron/commandes-historique";
import { listerLivreursActifs } from "@/lib/cuisine/commandes";
import {
  listerLivraisonsAEncaisser,
  calculerEncaissementsJour,
  listerAlertesEncaissement,
} from "@/lib/encaissements-livraison";
import { chargerStatistiquesJour } from "@/lib/patron/statistiques";
import { listerClientsAdmin } from "@/lib/patron/clients";
import { listerHistoriqueTiroir } from "@/lib/caisse/tiroir";
import { CompteurCreneaux } from "@/components/caisse/compteur-creneaux";
import { EnDirectApp } from "@/components/patron/en-direct-app";
import { TiroirCaissePatronApp } from "@/components/patron/tiroir-caisse-patron-app";
import { InscriptionsApp } from "@/components/patron/inscriptions-app";
import { listerInscriptions } from "@/lib/patron/inscriptions";
import { DepensesApp } from "@/components/patron/depenses-app";
import { chargerDonneesDepenses, moisCourantMayotte } from "@/lib/patron/depenses";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patron — 3 Sauces",
};

export default async function PatronPage() {
  const session = await requireRole(["patron"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F0E8] p-8">
        <PasswordForm />
      </main>
    );
  }

  const [
    produits,
    viandes,
    sauces,
    saveurs,
    parfums2l,
    imprimantes,
    historique,
    tempsMoyenParEmploye,
    livraisonsAEncaisser,
    encaissementsJour,
    alertesEncaissement,
    siteOuvert,
    joursFermeture,
    remiseLancement,
    metriquesGroupe,
    livreursActifs,
    statistiquesJour,
    clients,
    messageMoment,
    livraisonActive,
    terminauxSumup,
    historiqueTiroir,
    inscriptions,
    depensesInitiales,
  ] = await Promise.all([
    listerProduitsAdmin(),
    listerOptionsAdmin("viandes"),
    listerOptionsAdmin("sauces"),
    listerOptionsAdmin("saveurs"),
    listerOptionsAdmin("parfums2l"),
    listerImprimantesAdmin(),
    listerHistoriqueCommandes(),
    calculerTempsPreparationMoyenParEmploye(),
    listerLivraisonsAEncaisser(),
    calculerEncaissementsJour(),
    listerAlertesEncaissement(),
    chargerEtatSite(),
    chargerJoursFermeture(),
    chargerRemiseLancement(),
    calculerMetriquesGroupe(),
    listerLivreursActifs(),
    chargerStatistiquesJour(),
    listerClientsAdmin(),
    chargerMessageDuMoment(),
    chargerLivraisonActive(),
    listerTerminauxSumupAdmin(),
    // Ne jamais casser tout /patron si la table du tiroir n'existe pas encore.
    listerHistoriqueTiroir().catch(() => []),
    // Ne jamais casser tout /patron si la table des inscriptions n'existe pas encore.
    listerInscriptions().catch(() => []),
    // Idem pour la table des dépenses : l'onglet affiche un message plutôt que de casser la page.
    chargerDonneesDepenses().then((d) => ({ donnees: d, erreur: null as string | null })).catch(() => ({ donnees: null, erreur: "La table des dépenses n'est pas encore créée (SQL à coller dans Supabase)." as string | null })),
  ]);

  return (
    <main className="min-h-screen bg-[#F5F0E8] p-8 text-gray-900">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Espace Patron — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-500">
        Bonjour {session.nom}. Finances, stocks, fidélité : en construction (Module 6). Commandes du site en ligne,
        gestion complète de la carte et des options ci-dessous.
      </p>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <EtatSiteApp ouvertInitial={siteOuvert} />
        </div>
        <div className="flex-1">
          <LivraisonActiveApp actifInitial={livraisonActive} />
        </div>
      </div>

      <PatronTabs
        onglets={[
          {
            id: "aujourdhui",
            label: "Aujourd'hui",
            contenu: (
              <>
                <StatistiquesJourApp stats={statistiquesJour} />
                <EncaissementsJourApp totauxJour={encaissementsJour} alertes={alertesEncaissement} />
                <EncaissementsLivraisonApp livraisonsInitiales={livraisonsAEncaisser} />
              </>
            ),
          },
          {
            id: "en_direct",
            label: "En direct",
            contenu: (
              <div className="space-y-4">
                <CompteurCreneaux />
                <EnDirectApp />
              </div>
            ),
          },
          {
            id: "caisse",
            label: "Caisse",
            contenu: <TiroirCaissePatronApp joursInitiaux={historiqueTiroir} />,
          },
          {
            id: "clients",
            label: "Clients & fidélité",
            contenu: <ClientsApp clientsInitiaux={clients} />,
          },
          {
            id: "commandes",
            label: "Commandes",
            contenu: (
              <>
                <GroupeMetriquesApp metriques={metriquesGroupe} />
                <CommandesHistoriqueApp
                  historiqueInitial={historique}
                  tempsMoyenParEmploye={tempsMoyenParEmploye}
                  profilId={session.profilId}
                  livreursActifs={livreursActifs}
                />
              </>
            ),
          },
          {
            id: "carte",
            label: "Carte",
            contenu: (
              <>
                <ProduitsApp produitsInitiaux={produits} />
                <OptionsApp
                  viandesInitiales={viandes}
                  saucesInitiales={sauces}
                  saveursInitiales={saveurs}
                  parfums2lInitiales={parfums2l}
                  produitsBoissons={produits.filter((p) => p.categorie === "boisson")}
                />
              </>
            ),
          },
          {
            id: "depenses",
            label: "Dépenses",
            contenu: (
              <DepensesApp
                initial={depensesInitiales.donnees}
                moisInitial={moisCourantMayotte()}
                aujourdHui={dateMayotteIso()}
                erreurInitiale={depensesInitiales.erreur}
              />
            ),
          },
          {
            id: "emails",
            label: "Emails",
            contenu: <InscriptionsApp inscriptionsInitiales={inscriptions} />,
          },
          {
            id: "site",
            label: "Site",
            contenu: (
              <>
                <JoursFermetureApp joursInitiaux={joursFermeture} />
                <RemiseLancementApp debutInitial={remiseLancement.debut} finInitiale={remiseLancement.fin} />
              </>
            ),
          },
          {
            id: "imprimantes",
            label: "Imprimantes",
            contenu: (
              <>
                <ImprimantesApp imprimantesInitiales={imprimantes} />
                <MessageMomentApp texteInitial={messageMoment.texte} actifInitial={messageMoment.actif} />
              </>
            ),
          },
          {
            id: "paiement",
            label: "Paiement",
            contenu: <TerminauxSumupApp terminauxInitiaux={terminauxSumup} />,
          },
        ]}
      />
    </main>
  );
}
