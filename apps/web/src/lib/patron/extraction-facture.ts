import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES_DEPENSE, MODES_PAIEMENT_DEPENSE, type LigneDepense } from "@/lib/depenses-categories";

export interface ExtractionFacture {
  fournisseur: string | null;
  date: string | null;
  montantTotal: number | null;
  categorie: string;
  modePaiement: string | null;
  description: string;
  lignes: LigneDepense[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fournisseur", "date", "montant_total", "categorie", "mode_paiement", "description", "lignes"],
  properties: {
    fournisseur: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    montant_total: { type: ["number", "null"] },
    categorie: { type: "string", enum: CATEGORIES_DEPENSE.map((c) => c.valeur) },
    mode_paiement: { type: ["string", "null"], enum: [...MODES_PAIEMENT_DEPENSE.map((m) => m.valeur), null] },
    description: { type: "string" },
    lignes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["designation", "quantite", "unite", "prix_unitaire", "montant"],
        properties: {
          designation: { type: "string" },
          quantite: { type: ["number", "null"] },
          unite: { type: ["string", "null"] },
          prix_unitaire: { type: ["number", "null"] },
          montant: { type: "number" },
        },
      },
    },
  },
} as const;

const CONSIGNE = `Tu lis la facture ou le ticket de caisse d'un restaurant de restauration rapide à Mayotte (3 Sauces : grillades, tacos, plats locaux).
Extrais uniquement ce qui est écrit sur le document, sans rien inventer : mets null quand une information n'est pas lisible.
- fournisseur : le nom du vendeur ou du magasin.
- date : la date du document au format AAAA-MM-JJ (les dates françaises sont JJ/MM/AAAA).
- montant_total : le total à payer en euros (nombre avec un point décimal, pas de virgule).
- categorie : choisis la plus proche parmi la liste imposée. Viandes, poissons, volaille : "viande". Boissons : "boissons". Légumes, fruits, épicerie, riz, frites, pain, huile, sauces : "legumes_epicerie". Barquettes, sacs, serviettes, films : "emballages". Gaz, eau, électricité : "gaz_eau_electricite". En cas de doute : "autre".
- mode_paiement : seulement s'il est écrit sur le document, sinon null.
- description : une courte phrase (par exemple « Courses de viande chez Métro »).
- lignes : une entrée par article ou prestation, avec quantité, unité (kg, pièce, carton, litre...), prix unitaire et montant de la ligne en euros. Garde la désignation telle qu'écrite.`;

export type TypeFichierFacture = "jpg" | "png" | "webp" | "pdf";

const MEDIA_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as const;

/** Lit une facture (photo ou PDF) avec Claude et renvoie une proposition à relire par le patron. */
export async function extraireFacture(donneesBase64: string, type: TypeFichierFacture): Promise<ExtractionFacture> {
  const client = new Anthropic();
  const reponse = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          type === "pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: donneesBase64 } }
            : { type: "image", source: { type: "base64", media_type: MEDIA_TYPES[type] as "image/jpeg" | "image/png" | "image/webp", data: donneesBase64 } },
          { type: "text", text: CONSIGNE },
        ],
      },
    ],
  });

  if (reponse.stop_reason === "refusal") throw new Error("La facture n'a pas pu être lue.");
  const bloc = reponse.content.find((b) => b.type === "text");
  if (!bloc || bloc.type !== "text") throw new Error("Réponse vide.");
  const brut = JSON.parse(bloc.text) as {
    fournisseur: string | null;
    date: string | null;
    montant_total: number | null;
    categorie: string;
    mode_paiement: string | null;
    description: string;
    lignes: { designation: string; quantite: number | null; unite: string | null; prix_unitaire: number | null; montant: number }[];
  };
  return {
    fournisseur: brut.fournisseur,
    date: brut.date && /^\d{4}-\d{2}-\d{2}$/.test(brut.date) ? brut.date : null,
    montantTotal: brut.montant_total,
    categorie: brut.categorie,
    modePaiement: brut.mode_paiement,
    description: brut.description,
    lignes: brut.lignes.map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite,
      prixUnitaire: l.prix_unitaire,
      montant: l.montant,
    })),
  };
}
