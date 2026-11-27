import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@3sauces/supabase";
import { dateMayotteIso } from "@/lib/commande-publique/creneau";
import { categoriserAppareil, nettoyerReferent } from "@/lib/suivi/appareil";
import { normaliserSourceCampagne } from "@/lib/campagne";
import { ETAPES, TYPES_EVENEMENT, type EtapeVisiteur, type TypeEvenement } from "@/lib/suivi/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route publique mais strictement bornée : valeurs en liste blanche, taille
// limitée, aucune donnée personnelle acceptée ni stockée. Un échec ne doit
// jamais se voir côté client (réponse toujours vide).
export async function POST(request: Request) {
  const texte = await request.text();
  if (texte.length > 1000) return new NextResponse(null, { status: 204 });
  let body: { visiteur?: unknown; type?: unknown; etape?: unknown; produit?: unknown; cible?: unknown; duree_ms?: unknown; source?: unknown; referent?: unknown; page?: unknown; tactile?: unknown };
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
    } else if (body.type === "visite_detail") {
      // Une ligne par visite : provenance + catégorie d'appareil (jamais l'identifiant brut du navigateur).
      const { systeme, appareil, navigateur } = categoriserAppareil(request.headers.get("user-agent") ?? "", body.tactile === true);
      const page = typeof body.page === "string" && /^\/[a-z0-9/_-]{0,78}$/i.test(body.page) ? body.page : null;
      await supabase.from("visites_site").upsert(
        {
          visiteur: body.visiteur,
          date_jour: dateMayotteIso(),
          source: normaliserSourceCampagne(body.source),
          referent: nettoyerReferent(body.referent),
          page_arrivee: page,
          appareil,
          systeme,
          navigateur,
        },
        { onConflict: "visiteur", ignoreDuplicates: true }
      );
    } else if (body.type === "clic" || body.type === "produit_vu" || body.type === "temps_etape" || body.type === "temps_produit") {
      const cible = typeof body.cible === "string" ? body.cible.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) : "";
      if (!cible) return new NextResponse(null, { status: 204 });
      const duree = typeof body.duree_ms === "number" && Number.isFinite(body.duree_ms) ? Math.round(body.duree_ms) : null;
      if ((body.type === "temps_etape" || body.type === "temps_produit") && (duree === null || duree < 0 || duree > 1_800_000)) {
        return new NextResponse(null, { status: 204 });
      }
      // Plafond par visite (anti-abus) : 400 lignes.
      const { count } = await supabase.from("clics_site").select("id", { count: "exact", head: true }).eq("visiteur", body.visiteur);
      if ((count ?? 0) >= 400) return new NextResponse(null, { status: 204 });
      await supabase.from("clics_site").insert({
        visiteur: body.visiteur,
        date_jour: dateMayotteIso(),
        type: body.type,
        cible,
        duree_ms: body.type === "temps_etape" || body.type === "temps_produit" ? duree : null,
      });
    } else if (typeof body.type === "string" && (TYPES_EVENEMENT as readonly string[]).includes(body.type)) {
      const produit = typeof body.produit === "string" ? body.produit.trim().slice(0, 80) : "";
      if (body.type === "commande_validee") await supabase.from("visites_site").update({ a_commande: true }).eq("visiteur", body.visiteur);
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
