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
        <p>
          Profil déclaré (étudiant, lycéen ou collégien, enseignant ou personnel d&apos;un établissement, salarié,
          autre) : utilisé uniquement pour adapter nos offres et nos e-mails, jamais transmis à des tiers.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Inscription aux informations et aux offres</h2>
        <p>
          Si vous laissez votre adresse email sur notre site pour être prévenu de la réouverture, nous
          conservons cette adresse, la date de votre inscription et le texte que vous avez accepté. Elle
          sert uniquement à vous prévenir de la réouverture ; si vous cochez la case correspondante
          (facultative, jamais pré-cochée), elle sert aussi à vous envoyer les offres et actualités de
          3 Sauces. Base légale : votre consentement.
        </p>
        <p>
          Vous pouvez vous désinscrire à tout moment grâce au lien présent dans chaque email, ou en nous
          contactant. Votre adresse est conservée jusqu&apos;à votre désinscription et au plus trois ans
          après notre dernier contact avec vous.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Emails de fidélité et de relance aux clients</h2>
        <p>
          Si vous avez déjà commandé chez 3 Sauces et que vous nous avez donné votre adresse email, nous
          pouvons vous écrire pour vous informer de vos points de fidélité et récompenses, ou pour vous
          proposer de commander à nouveau (produits similaires à ceux déjà commandés). Base légale : notre
          intérêt légitime à fidéliser nos clients. Vous pouvez vous y opposer à tout moment grâce au lien
          « Me désinscrire » présent dans chaque email : plus aucun email de ce type ne vous sera envoyé.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Retenir votre numéro sur cet appareil</h2>
        <p>
          Quand vous consultez vos points de fidélité sur 3sauces.fr, votre numéro de téléphone et votre
          adresse email sont mémorisés dans le navigateur de votre appareil, pour retrouver vos points de fidélité à votre
          prochaine visite sans les retaper. Ils restent sur votre appareil et ne sont envoyés qu&apos;à notre
          serveur pour afficher vos points de fidélité. Vous pouvez les effacer à tout moment avec le lien « Ce n&apos;est
          pas moi » du panier, ou en vidant les données de votre navigateur.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Mesure d&apos;audience anonyme</h2>
        <p>
          Pour améliorer le site, nous comptons de façon anonyme les visites et les étapes de la
          commande (par exemple : plat ajouté au panier). Aucun cookie n&apos;est déposé, aucune donnée
          personnelle ni adresse IP n&apos;est enregistrée : seul un identifiant aléatoire, propre à
          votre onglet et effacé à sa fermeture, est utilisé.
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
