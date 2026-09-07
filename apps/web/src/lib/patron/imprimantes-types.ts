/**
 * Types partagés entre le serveur (lib/patron/imprimantes.ts) et le client
 * (components/patron/imprimantes-app.tsx, et l'endpoint caisse en lecture
 * seule /api/caisse/imprimantes).
 */
export interface ImprimanteAdmin {
  id: string;
  role: "comptoir" | "cuisine";
  nom: string;
  adresseIp: string | null;
  port: number;
}

export interface ImprimanteAdminPatch {
  nom?: string;
  adresseIp?: string | null;
  port?: number;
}
