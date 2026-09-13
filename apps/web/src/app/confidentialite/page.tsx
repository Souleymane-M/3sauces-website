import type { Metadata } from "next";
import { PageLegale } from "@/components/legal/page-legale";

export const metadata: Metadata = {
  title: "Politique de confidentialité — 3 Sauces",
};

export default function ConfidentialitePage() {
  return (
    <PageLegale titre="Politique de confidentialité">
      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Responsable du traitement des données</h2>
        <p>3 Sauces, 841 Boulevard du Soleil Levant, Iloni, Dembéni, Mayotte — 06 39 63 81 78</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Données collectées</h2>
        <p>
          Lors d&apos;une commande : nom, numéro de téléphone, adresse (si livraison), détail de la
          commande.
        </p>
        <p>
          Lors de la création d&apos;un compte fidélité : adresse email, obligatoire pour recevoir les
          notifications liées au programme de fidélité (récompense disponible, rappel avant expiration).
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Finalité</h2>
        <p>Ces données sont utilisées uniquement pour :</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Traiter et livrer votre commande</li>
          <li>Vous contacter en cas de besoin concernant votre commande</li>
          <li>Vous informer de vos récompenses de fidélité par email (si vous avez un compte fidélité)</li>
        </ul>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Base légale</h2>
        <p>
          Exécution de la commande (nom, téléphone, adresse) et exécution du programme de fidélité
          (email).
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Durée de conservation</h2>
        <p>
          Les données liées à une commande sont conservées le temps nécessaire à son traitement, puis
          archivées selon les obligations comptables légales.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Destinataires</h2>
        <p>
          Vos données sont accessibles uniquement à l&apos;équipe de 3 Sauces. Elles sont hébergées
          techniquement par Vercel et Supabase, prestataires techniques, sans usage commercial de leur
          part.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation et d&apos;opposition concernant vos données. Pour exercer ces
          droits, contactez-nous au 06 39 63 81 78 ou à l&apos;adresse du restaurant.
        </p>
      </section>
    </PageLegale>
  );
}
