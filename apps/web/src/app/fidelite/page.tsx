import type { Metadata } from "next";
import { PageLegale } from "@/components/legal/page-legale";

export const metadata: Metadata = {
  title: "La fidélité chez 3 Sauces",
};

export default function FidelitePage() {
  return (
    <PageLegale titre="La fidélité chez 3 Sauces">
      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Comment ça marche</h2>
        <p>
          Chez 3 Sauces, chaque euro dépensé vous rapproche d&apos;une récompense — que vous commandiez sur
          place, à emporter, en livraison, ou sur 3sauces.fr. Un seul numéro de téléphone suffit, pas de
          carte à garder, pas de compte à créer.
        </p>
        <p>→ Tous les 10€ cumulés (même en plusieurs commandes), vous gagnez 1 tampon.</p>
        <p>→ À 10 tampons (100€ cumulés), vous débloquez 10€ offerts sur votre prochaine commande.</p>
        <p>
          C&apos;est tout. Pas de calcul compliqué, pas de date à retenir — votre récompense apparaît toute
          seule sur 3sauces.fr et à la caisse dès qu&apos;elle est prête.
        </p>
        <p className="font-bold text-[#8B2020]">Chaque euro compte chez 3 Sauces.</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Conditions d&apos;utilisation</h2>
        <p>
          → L&apos;accumulation se fait sur l&apos;ensemble de vos commandes (comptoir, livraison, site),
          quel que soit le montant de chaque commande individuelle.
        </p>
        <p>
          → La récompense de 10€ est utilisable en une seule fois, sur une commande d&apos;un montant
          minimum de 10€.
        </p>
        <p>→ Elle n&apos;est pas fractionnable : elle ne peut pas être répartie sur plusieurs commandes.</p>
        <p>
          → La récompense est valable 3 mois à partir de son obtention. Passé ce délai, elle expire et le
          compteur repart à zéro.
        </p>
        <p>
          → Sur 3sauces.fr, un code de vérification par SMS peut vous être demandé la première fois, pour
          confirmer que vous êtes bien le titulaire du numéro utilisé — une seule fois par appareil,
          valable 30 jours.
        </p>
        <p>
          → En cas de doute sur l&apos;identité du porteur de la carte fidélité, 3 Sauces se réserve le
          droit de demander une pièce d&apos;identité avant d&apos;appliquer la récompense.
        </p>
      </section>
    </PageLegale>
  );
}
