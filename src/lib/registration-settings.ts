import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether registration asks about under-18s on the tenant the request host
 * resolves to (#1416).
 *
 * True on a failed read. Asking is today's behaviour and every tenant's
 * default, and the RPC reads the setting itself, so a form that asks when the
 * tenant has turned it off only collects answers the RPC then discards.
 */
export async function getPublicAsksAboutMinors(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("public_registration_settings")
    .select("asks_about_minors")
    .maybeSingle();
  if (error || !data) return true;
  return data.asks_about_minors !== false;
}

/**
 * The current tenant's setting, for the portal switch (#1416). Null when the
 * caller may not change it (events:manage).
 */
export async function getRegistrationAsksAboutMinors(
  supabase: SupabaseClient,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("registration_asks_about_minors");
  if (error || typeof data !== "boolean") return null;
  return data;
}
