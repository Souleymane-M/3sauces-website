import Link from "next/link";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { FooterLegal } from "@/components/legal/footer-legal";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";

/** Heure seule si le retrait est aujourd'hui, "le lundi 22 septembre à 12h30" sinon (commande à l'avance). */
function formaterHeureSouhaitee(iso: string): string {
  const jourMayotte = new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" }).format(new Date(iso));
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

  if (jourMayotte === dateMayotteIso()) return `à ${heure}`;

  const jour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Indian/Mayotte",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return `le ${jour} à ${heure}`;
}

interface CommandeConfirmeePageProps {
  searchParams: Promise<{ canal?: string; heure?: string; commande?: string; paiement?: string }>;
}

export default async function CommandeConfirmeePage({ searchParams }: CommandeConfirmeePageProps) {
  const { canal, heure, commande, paiement } = await searchParams;
  const estLivraison = canal === "livraison";

  // Lecture systématique en base (paiement_statut ET heure_souhaitee) dès
  // qu'on a l'id de la commande — jamais confiance dans les seuls paramètres
  // d'URL, qui ne transportaient d'ailleurs jamais l'heure pour le retour
  // Stripe. Pour le paiement, la mise à jour autoritaire de paiement_statut
  // vient du webhook, jamais de ce simple retour de redirection — l'ordre
  // d'arrivée entre les deux n'est jamais garanti.
  let paiementConfirme: boolean | null = null;
  let libelleHeure: string | null = heure ?? null;
  if (commande) {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from("commandes")
      .select("paiement_statut, heure_souhaitee")
      .eq("id", commande)
      .maybeSingle();
    if (paiement === "stripe") {
      paiementConfirme = data?.paiement_statut === "paye";
    }
    if (data?.heure_souhaitee) {
      libelleHeure = formaterHeureSouhaitee(data.heure_souhaitee);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">{paiementConfirme === false ? "⏳" : "✅"}</p>
      <h1 className="text-2xl font-bold">Votre commande est bien reçue</h1>
      {libelleHeure && (
        <p className="text-lg text-gray-300">
          {estLivraison ? `Vous serez livré ${libelleHeure}.` : `Vous pourrez récupérer votre commande ${libelleHeure}.`}
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
