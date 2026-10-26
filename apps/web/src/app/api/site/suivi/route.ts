import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import { ETAPES, TYPES_EVENEMENT, type EtapeVisiteur, type TypeEvenement } from "@/lib/suivi/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route publique mais strictement bornée : valeurs en liste blanche, taille
// limitée, aucune donnée personnelle acceptée ni stockée. Un échec ne doit
// jamais se voir côté client (réponse toujours vide).
export async function POST(request: Request) {
  const texte = await request.text();
  if (texte.length > 1000) return new NextResponse(null, { status: 204 });
  let body: { visiteur?: unknown; type?: unknown; etape?: unknown; produit?: unknown };
  try {
    body = JSON.parse(texte);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (typeof body.visiteur !== "string" || !UUID.test(body.visiteur)) return new NextResponse(null, { status: 204 });

  try {
    const supabase = createServiceSupabaseClient();
    if (body.type === "ping") {
      if (typeof body.etape !== "string" || !(ETAPES as readonly string[]).includes(body.etape)) {
        return new NextResponse(null, { status: 204 });
      }
      await supabase
        .from("visiteurs_site")
        .upsert({ visiteur: body.visiteur, etape: body.etape as EtapeVisiteur, derniere_activite: new Date().toISOString() });
      // Ménage au passage (2 % des appels) : la présence n'a d'intérêt que sur quelques secondes.
      if (Math.random() < 0.02) {
        await supabase
          .from("visiteurs_site")
          .delete()
          .lt("derniere_activite", new Date(Date.now() - 2 * 24 * 3600_000).toISOString());
      }
    } else if (typeof body.type === "string" && (TYPES_EVENEMENT as readonly string[]).includes(body.type)) {
      const produit = typeof body.produit === "string" ? body.produit.trim().slice(0, 80) : "";
      await supabase
        .from("evenements_site")
        .upsert(
          { visiteur: body.visiteur, type: body.type as TypeEvenement, produit, date_jour: dateMayotteIso() },
          { onConflict: "visiteur,type,produit,date_jour", ignoreDuplicates: true }
        );
    }
  } catch {
    // Silencieux : jamais d'impact sur la commande du client.
  }
  return new NextResponse(null, { status: 204 });
}
