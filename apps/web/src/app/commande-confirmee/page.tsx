import Link from "next/link";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { FooterLegal } from "@/components/legal/footer-legal";

interface CommandeConfirmeePageProps {
  searchParams: Promise<{ canal?: string; heure?: string; commande?: string; paiement?: string }>;
}

export default async function CommandeConfirmeePage({ searchParams }: CommandeConfirmeePageProps) {
  const { canal, heure, commande, paiement } = await searchParams;
  const estLivraison = canal === "livraison";

  // Paiement en ligne (Stripe) : la mise à jour autoritaire de
  // paiement_statut vient du webhook, jamais de ce simple retour de
  // redirection — l'ordre d'arrivée entre les deux n'est jamais garanti,
  // donc on relit l'état réel plutôt que de supposer "payé" par défaut.
  let paiementConfirme: boolean | null = null;
  if (paiement === "stripe" && commande) {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from("commandes")
      .select("paiement_statut")
      .eq("id", commande)
      .maybeSingle();
    paiementConfirme = data?.paiement_statut === "paye";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">{paiementConfirme === false ? "⏳" : "✅"}</p>
      <h1 className="text-2xl font-bold">Votre commande est bien reçue</h1>
      {heure && (
        <p className="text-lg text-gray-300">
          {estLivraison ? `Vous serez livré à ${heure}.` : `Vous pourrez récupérer votre commande à ${heure}.`}
        </p>
      )}
      {paiementConfirme === true && <p className="text-sm text-gray-500">Paiement en ligne reçu, commande confirmée.</p>}
      {paiementConfirme === false && (
        <p className="text-sm text-gray-500">
          Paiement en cours de confirmation — cette étape prend en général quelques secondes, tu recevras la
          confirmation par SMS.
        </p>
      )}
      {paiementConfirme === null && (
        <p className="text-sm text-gray-500">
          Paiement en espèces ou par carte, à la {estLivraison ? "livraison" : "prise en main"}.
        </p>
      )}
      <Link href="/commander" className="mt-4 rounded bg-white px-4 py-2 text-sm font-semibold text-black">
        Nouvelle commande
      </Link>
      <FooterLegal />
    </main>
  );
}
