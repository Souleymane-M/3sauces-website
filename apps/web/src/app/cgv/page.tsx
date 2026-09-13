import type { Metadata } from "next";
import { PageLegale } from "@/components/legal/page-legale";

export const metadata: Metadata = {
  title: "Conditions générales de vente — 3 Sauces",
};

export default function CgvPage() {
  return (
    <PageLegale titre="Conditions générales de vente">
      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 1 — Objet</h2>
        <p>
          Les présentes CGV régissent les ventes de produits alimentaires proposées par 3 Sauces via le
          site 3sauces.fr, pour un retrait sur place, à emporter, ou une livraison.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 2 — Prix</h2>
        <p>
          Les prix affichés sont en euros, toutes taxes non applicables (TVA non applicable, article 293
          B du CGI). 3 Sauces se réserve le droit de modifier ses prix à tout moment ; le prix applicable
          est celui affiché au moment de la commande.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 3 — Commande</h2>
        <p>
          La commande est passée via le site, par choix des produits et renseignement des coordonnées
          du client (nom, téléphone, adresse si livraison, créneau souhaité).
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 4 — Livraison</h2>
        <p>
          La livraison est proposée uniquement dans la zone de Dembéni, sous réserve d&apos;un montant
          minimum de commande de 8€. En dehors de cette zone, seul le retrait sur place ou à emporter
          est proposé.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 5 — Paiement</h2>
        <p>
          Le paiement s&apos;effectue à la prise en main de la commande (sur place, à emporter, ou à la
          livraison), en espèces ou par carte bancaire.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 6 — Droit de rétractation</h2>
        <p>
          Conformément à l&apos;article L221-28 du Code de la consommation, les denrées alimentaires
          périssables ne sont pas soumises au droit de rétractation. Toute commande passée est donc
          ferme et définitive.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 7 — Réclamations</h2>
        <p>Pour toute réclamation, contactez 3 Sauces au 06 39 63 81 78.</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 8 — Médiation à la consommation</h2>
        <p>
          Conformément à l&apos;article L616-1 du Code de la consommation, en cas de litige non résolu
          directement avec 3 Sauces, le client peut recourir gratuitement à un service de médiation de
          la consommation. [Coordonnées du médiateur à compléter dès adhésion — démarche en cours]
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Article 9 — Droit applicable</h2>
        <p>Les présentes CGV sont soumises au droit français.</p>
      </section>
    </PageLegale>
  );
}
