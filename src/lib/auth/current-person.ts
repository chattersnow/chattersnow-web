import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the signed-in user to a people.id via the resolve_current_person_id
 * RPC, which auto-links people.auth_user_id by email on first use. Returns
 * null if the user isn't signed in or no matching people row exists.
 */
export async function resolveCurrentPersonId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_current_person_id");
  if (error) return null;
  return (data as string | null) ?? null;
}
