/**
 * Types partagés entre le serveur (lib/patron/imprimantes.ts) et le client
 * (components/patron/imprimantes-app.tsx). Depuis 2026-10-13, une
 * imprimante n'a plus besoin d'adresse IP/port/relais : elle va
 * elle-même chercher son travail via Server Direct Print, identifiée
 * uniquement par son jeton (`directPrintToken`) — cf.
 * app/api/print/epson/[token].
 */
export interface ImprimanteAdmin {
  id: string;
  role: "comptoir" | "cuisine";
  nom: string;
  directPrintToken: string | null;
}

export interface ImprimanteAdminPatch {
  nom?: string;
  directPrintToken?: string | null;
}
