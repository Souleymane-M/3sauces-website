import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-session";
import { PasswordForm } from "@/components/auth/password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProduitsApp } from "@/components/patron/produits-app";
import { OptionsApp } from "@/components/patron/options-app";
import { ImprimantesApp } from "@/components/patron/imprimantes-app";
import { CommandesHistoriqueApp } from "@/components/patron/commandes-historique-app";
import { EncaissementsLivraisonApp } from "@/components/patron/encaissements-livraison-app";
import { EncaissementsJourApp } from "@/components/patron/encaissements-jour-app";
import { EtatSiteApp } from "@/components/patron/etat-site-app";
import { JoursFermetureApp } from "@/components/patron/jours-fermeture-app";
import { RemiseLancementApp } from "@/components/patron/remise-lancement-app";
import { GroupeMetriquesApp } from "@/components/patron/groupe-metriques-app";
import { listerProduitsAdmin } from "@/lib/patron/produits";
import { calculerMetriquesGroupe } from "@/lib/patron/groupe-metriques";
import { chargerEtatSite, chargerJoursFermeture, chargerRemiseLancement } from "@/lib/patron/parametres";
import { listerOptionsAdmin } from "@/lib/patron/options";
import { listerImprimantesAdmin } from "@/lib/patron/imprimantes";
import { listerHistoriqueCommandes, calculerTempsPreparationMoyenParEmploye } from "@/lib/patron/commandes-historique";
import {
  listerLivraisonsAEncaisser,
  calculerEncaissementsJour,
  listerAlertesEncaissement,
} from "@/lib/encaissements-livraison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patron — 3 Sauces",
};

export default async function PatronPage() {
  const session = await requireRole(["patron"]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
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
  ]);

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Espace Patron — 3 Sauces</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 mb-4 text-sm text-gray-500">
        Bonjour {session.nom}. Finances, stocks, fidélité : en construction (Module 6). Commandes du site en ligne,
        gestion complète de la carte et des options ci-dessous.
      </p>
      <div className="mb-4 space-y-3">
        <EtatSiteApp ouvertInitial={siteOuvert} />
        <JoursFermetureApp joursInitiaux={joursFermeture} />
        <RemiseLancementApp debutInitial={remiseLancement.debut} finInitiale={remiseLancement.fin} />
        <GroupeMetriquesApp metriques={metriquesGroupe} />
      </div>
      <EncaissementsJourApp totauxJour={encaissementsJour} alertes={alertesEncaissement} />
      <EncaissementsLivraisonApp livraisonsInitiales={livraisonsAEncaisser} />
      <CommandesHistoriqueApp historiqueInitial={historique} tempsMoyenParEmploye={tempsMoyenParEmploye} />
      <ProduitsApp produitsInitiaux={produits} />
      <OptionsApp
        viandesInitiales={viandes}
        saucesInitiales={sauces}
        saveursInitiales={saveurs}
        parfums2lInitiales={parfums2l}
      />
      <ImprimantesApp imprimantesInitiales={imprimantes} />
    </main>
  );
}
