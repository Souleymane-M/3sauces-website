import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { requireRole } from "@/lib/auth/get-session";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import { extraireFacture, type TypeFichierFacture } from "@/lib/patron/extraction-facture";

export const maxDuration = 60;

const TYPES: Record<string, TypeFichierFacture> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const TAILLE_MAX = 4 * 1024 * 1024;

/**
 * Reçoit la photo (ou le PDF) d'une facture, la range dans le bucket privé « factures », puis la fait lire par l'IA.
 * Renvoie le chemin du fichier et une proposition à relire : rien n'est enregistré comme dépense ici.
 */
export async function POST(request: Request) {
  const session = await requireRole(["patron"]);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const formulaire = await request.formData().catch(() => null);
  const fichier = formulaire?.get("fichier");
  if (!(fichier instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const type = TYPES[fichier.type];
  if (!type) return NextResponse.json({ error: "Format non accepté : photo (JPG, PNG) ou PDF." }, { status: 400 });
  if (fichier.size > TAILLE_MAX) return NextResponse.json({ error: "Fichier trop lourd (4 Mo maximum)." }, { status: 400 });

  const octets = Buffer.from(await fichier.arrayBuffer());
  const [annee, mois] = dateMayotteIso().split("-");
  const chemin = `${annee}/${mois}/${randomUUID()}.${type}`;

  const supabase = createServiceSupabaseClient();
  const { error: erreurEnvoi } = await supabase.storage.from("factures").upload(chemin, octets, { contentType: fichier.type });
  if (erreurEnvoi) return NextResponse.json({ error: "Envoi de la facture impossible." }, { status: 500 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ chemin, extraction: null, avertissement: "La lecture automatique n'est pas encore activée (clé de l'IA manquante) : remplis les champs à la main, la photo est bien gardée." });
  }

  try {
    const extraction = await extraireFacture(octets.toString("base64"), type);
    return NextResponse.json({ chemin, extraction });
  } catch {
    // La facture est bien rangée : le patron peut remplir à la main sans renvoyer la photo.
    return NextResponse.json({ chemin, extraction: null, avertissement: "La lecture automatique a échoué : remplis les champs à la main." });
  }
}
