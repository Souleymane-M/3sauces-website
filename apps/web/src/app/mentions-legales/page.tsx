import type { Metadata } from "next";
import { PageLegale } from "@/components/legal/page-legale";

export const metadata: Metadata = {
  title: "Mentions légales — 3 Sauces",
};

export default function MentionsLegalesPage() {
  return (
    <PageLegale titre="Mentions légales">
      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Éditeur du site</h2>
        <p>
          3 Sauces — Entreprise individuelle (auto-entrepreneur)
          <br />
          SIRET : 532 276 581 00040
          <br />
          Adresse : 841 Boulevard du Soleil Levant, Iloni, Dembéni, 97660, Mayotte
          <br />
          Téléphone : 06 39 63 81 78
          <br />
          TVA non applicable, article 293 B du CGI
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Directeur de la publication</h2>
        <p>Moussa Soulaimana — Responsable de 3 Sauces</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Hébergement</h2>
        <p>
          Vercel Inc.
          <br />
          440 N Barranca Ave #4133, Covina, CA 91723, États-Unis
          <br />
          Base de données : Supabase
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-gray-900">Activité</h2>
        <p>Restauration rapide — vente à emporter, sur place et livraison</p>
      </section>
    </PageLegale>
  );
}
