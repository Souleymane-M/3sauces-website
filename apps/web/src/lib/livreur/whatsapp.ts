import { formaterTelephonePourWhatsapp } from "@/lib/telephone";
import type { LivraisonAssignee } from "./types";

/** "#0001", "#0042" — même format que sur les tickets, pour que le client reconnaisse immédiatement sa commande. */
function formaterNumeroCommande(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

/**
 * Prénom seul, jamais le nom de famille, pour une formule simple et
 * personnelle. `LivraisonAssignee.nom` combine prénom + nom (cf.
 * `nomClientAffiche` côté caisse) — en livraison le prénom est toujours
 * obligatoire (caisse et site), donc le premier mot est fiable sans avoir
 * à faire remonter un champ `prenom` séparé jusqu'ici.
 */
function prenomClient(livraison: LivraisonAssignee): string {
  return livraison.nom.trim().split(/\s+/)[0] ?? "";
}

/**
 * Une seule université à Mayotte : une adresse qui la mentionne (le mot
 * exact varie selon ce que le client a tapé — "Université", "Univ",
 * "fac"...) a un point de RDV fixe et connu de tous les livreurs, jamais
 * besoin de négocier au téléphone — demande explicite du patron,
 * 2026-10-23.
 */
function pointDeRdv(livraison: LivraisonAssignee): string {
  const adresse = (livraison.adresse ?? "").toLowerCase();
  if (/universit|\bfac\b/.test(adresse)) return "au portail";
  return "au point de RDV";
}

/**
 * Message pré-rempli annonçant le départ en livraison — texte fixe,
 * jamais personnalisable depuis l'app (demande explicite du patron,
 * 2026-10-22) : simple, cohérent d'un client à l'autre, prêt à envoyer
 * sans réflexion au moment de partir.
 */
export function construireMessageDepart(livraison: LivraisonAssignee): string {
  const prenom = prenomClient(livraison);
  const salutation = prenom ? `Bonjour ${prenom}` : "Bonjour";
  return `${salutation}, c'est 3 Sauces, je suis en route avec ta commande ${formaterNumeroCommande(livraison.numero)}, retrouve-moi ${pointDeRdv(livraison)} dans quelques minutes 🛵`;
}

/**
 * Lien "cliquer pour discuter" WhatsApp (wa.me) — ouvre directement la
 * conversation avec CE client, message déjà écrit dans le champ de
 * saisie, sur n'importe quel téléphone ayant WhatsApp installé (le
 * client n'a jamais besoin d'avoir enregistré le numéro du resto dans
 * ses contacts, contrairement à une liste de diffusion). `null` si le
 * client n'a pas de téléphone identifié (ne devrait jamais arriver en
 * livraison, où il est obligatoire, mais type défensif).
 */
export function construireLienWhatsapp(livraison: LivraisonAssignee): string | null {
  if (!livraison.clientTelephone) return null;
  const numero = formaterTelephonePourWhatsapp(livraison.clientTelephone);
  const texte = encodeURIComponent(construireMessageDepart(livraison));
  return `https://wa.me/${numero}?text=${texte}`;
}
