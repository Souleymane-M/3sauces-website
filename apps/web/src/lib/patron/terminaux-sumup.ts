import "server-only";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { jumelerLecteur, supprimerLecteur, recupererLecteur } from "@/lib/sumup/api";
import type { TerminalSumUpAdmin } from "./terminaux-sumup-types";

/**
 * Liste les boîtiers SumUp jumelés — le statut est interrogé en direct
 * auprès de SumUp (jamais stocké en base, qui pourrait devenir périmée
 * silencieusement : ex. un boîtier débranché depuis des jours). Un échec
 * de l'appel SumUp pour UN lecteur n'empêche jamais d'afficher les
 * autres ni le nom déjà connu localement.
 */
export async function listerTerminauxSumupAdmin(): Promise<TerminalSumUpAdmin[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("terminaux_sumup")
    .select("id, nom, reader_id")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Impossible de charger les terminaux SumUp : ${error.message}`);
  }

  return Promise.all(
    (data ?? []).map(async (t) => {
      let statut: TerminalSumUpAdmin["statut"] = null;
      try {
        const lecteur = await recupererLecteur(t.reader_id);
        statut = lecteur.status;
      } catch (e) {
        console.error("[patron/terminaux-sumup] échec lecture statut :", t.reader_id, e);
      }
      return { id: t.id, nom: t.nom, readerId: t.reader_id, statut };
    })
  );
}

/**
 * Jumelage d'un nouveau boîtier Solo (jamais Solo Lite, incompatible avec
 * la Cloud API — cf. commentaire sur la table) : appelle SumUp avec le
 * code affiché sur l'appareil, puis enregistre l'identifiant renvoyé.
 * Si l'enregistrement en base échoue après un jumelage SumUp réussi, on
 * supprime immédiatement côté SumUp pour ne jamais laisser un lecteur
 * jumelé mais invisible/inutilisable depuis /patron.
 */
export async function jumelerTerminalSumup(pairingCode: string, nom: string): Promise<TerminalSumUpAdmin> {
  const lecteur = await jumelerLecteur(pairingCode, nom);

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("terminaux_sumup")
    .insert({ nom, reader_id: lecteur.id })
    .select("id, nom, reader_id")
    .single();

  if (error || !data) {
    await supprimerLecteur(lecteur.id).catch((e) =>
      console.error("[patron/terminaux-sumup] échec nettoyage après erreur d'enregistrement :", e)
    );
    throw new Error(`Jumelage réussi côté SumUp mais échec d'enregistrement : ${error?.message ?? "inconnu"}`);
  }

  return { id: data.id, nom: data.nom, readerId: data.reader_id, statut: lecteur.status };
}

/**
 * Retire un terminal — best effort côté SumUp (le boîtier redevient
 * simplement utilisable pour un nouveau jumelage) : la suppression locale
 * ne doit jamais échouer à cause d'un appel SumUp qui plante.
 */
export async function supprimerTerminalSumup(id: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data, error: erreurLecture } = await supabase
    .from("terminaux_sumup")
    .select("reader_id")
    .eq("id", id)
    .maybeSingle();
  if (erreurLecture) {
    throw new Error(`Impossible de retrouver le terminal : ${erreurLecture.message}`);
  }

  const { error } = await supabase.from("terminaux_sumup").delete().eq("id", id);
  if (error) {
    throw new Error(`Impossible de supprimer le terminal : ${error.message}`);
  }

  if (data?.reader_id) {
    await supprimerLecteur(data.reader_id).catch((e) =>
      console.error("[patron/terminaux-sumup] échec suppression côté SumUp :", e)
    );
  }
}
