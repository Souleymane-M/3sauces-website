import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Client Supabase côté navigateur (utilise la clé anon — respecte les RLS).
 * À utiliser dans les composants client (caisse, livreur, site).
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définis (.env.local)."
    );
  }

  return createClient<Database>(url, anonKey);
}

/**
 * Client Supabase côté serveur avec la clé service_role (bypass RLS).
 * Ne JAMAIS exposer côté navigateur — usage strict dans route handlers /
 * server actions (ex: déduction de stock, calculs finances patron, OCR factures).
 */
export function createServiceSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (.env.local, jamais commité)."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
