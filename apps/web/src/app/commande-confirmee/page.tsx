import Link from "next/link";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { FooterLegal } from "@/components/legal/footer-legal";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import { compterTamponsDisponibles } from "@/lib/fidelite/tampons";
import { MONTANT_RECOMPENSE, NB_TAMPONS_RECOMPENSE, calculerProgressionCommande, formaterEuros, progressionTampons } from "@/lib/fidelite/regles";

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

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
  let messagesPoints: string[] = [];
  if (commande) {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from("commandes")
      .select("paiement_statut, heure_souhaitee, montant, client_telephone")
      .eq("id", commande)
      .maybeSingle();
    if (paiement === "stripe") {
      paiementConfirme = data?.paiement_statut === "paye";
    }
    if (data?.heure_souhaitee) {
      libelleHeure = formaterHeureSouhaitee(data.heure_souhaitee);
    }

    // Points de fidélité : gagnés (si le paiement est déjà passé) ou à venir (dès qu'il est payé), et solde actuel.
    if (data?.client_telephone) {
      const [{ data: client }, solde] = await Promise.all([
        supabase.from("clients").select("montant_cumule").eq("telephone", data.client_telephone).maybeSingle(),
        compterTamponsDisponibles(supabase, data.client_telephone),
      ]);
      if (client) {
        const net = Number(data.montant);
        const cumul = client.montant_cumule ?? 0;
        const payee = data.paiement_statut === "paye";
        const avant = payee ? (((cumul - net) % 100) + 100) % 100 : cumul;
        const gagnes = calculerProgressionCommande(net, avant, solde.nombre, 0).tamponsGagnes;
        const totalPoints = progressionTampons(cumul, solde.nombre);
        const manque = NB_TAMPONS_RECOMPENSE - (Math.floor(cumul / MONTANT_RECOMPENSE) % NB_TAMPONS_RECOMPENSE);
        const lignes: string[] = [];
        if (payee) {
          lignes.push(
            gagnes > 0
              ? `🎁 Tu viens de gagner ${pluriel(gagnes, "point")} de fidélité. Tu en as maintenant ${totalPoints}.`
              : totalPoints > 0
                ? `🎁 Tu as ${pluriel(totalPoints, "point")} de fidélité. Plus que ${formaterEuros(MONTANT_RECOMPENSE - (cumul % MONTANT_RECOMPENSE))} pour le prochain.`
                : `🎁 Plus que ${formaterEuros(MONTANT_RECOMPENSE - (cumul % MONTANT_RECOMPENSE))} pour gagner ton premier point de fidélité.`
          );
        } else {
          lignes.push(
            gagnes > 0
              ? `🎁 Cette commande te rapporte ${pluriel(gagnes, "point")} de fidélité, ajouté${gagnes > 1 ? "s" : ""} dès qu'elle est payée. Tu en as ${totalPoints} aujourd'hui.`
              : totalPoints > 0
                ? `🎁 Tu as ${pluriel(totalPoints, "point")} de fidélité. Plus que ${formaterEuros(MONTANT_RECOMPENSE - (cumul % MONTANT_RECOMPENSE))} pour le prochain.`
                : `🎁 Plus que ${formaterEuros(MONTANT_RECOMPENSE - (cumul % MONTANT_RECOMPENSE))} pour gagner ton premier point de fidélité.`
          );
        }
        lignes.push(
          solde.nombre > 0
            ? `🎉 Tu as ${solde.nombre * MONTANT_RECOMPENSE} € de récompense disponible : utilise-la sur ta prochaine commande.`
            : `Encore ${pluriel(manque, "point")} de fidélité pour avoir ${MONTANT_RECOMPENSE} € de récompense.`
        );
        messagesPoints = lignes;
      }
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
      {paiementConfirme === true && <p className="text-sm text-gray-700">Paiement en ligne reçu, commande confirmée.</p>}
      {paiementConfirme === false && (
        <p className="text-sm text-gray-700">
          Paiement en cours de confirmation — cela prend en général quelques secondes. Recharge cette page pour voir
          la confirmation.
        </p>
      )}
      {paiementConfirme === null && (
        <p className="text-sm text-gray-700">
          Paiement en espèces ou par carte, à la {estLivraison ? "livraison" : "prise en main"}.
        </p>
      )}
      {messagesPoints.length > 0 && (
        <div className="max-w-sm space-y-1 rounded-lg border border-green-700 bg-green-50 p-3 text-sm text-gray-900">
          {messagesPoints.map((m) => (
            <p key={m} className="font-semibold">
              {m}
            </p>
          ))}
        </div>
      )}
      <Link href="/commander" className="mt-4 rounded bg-white px-4 py-2 text-sm font-semibold text-black">
        Nouvelle commande
      </Link>
      <FooterLegal />
    </main>
  );
}
