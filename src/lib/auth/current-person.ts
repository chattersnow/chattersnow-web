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

export type CurrentPerson = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Same resolution as resolveCurrentPersonId, but also fetches the person's
 * name/contact fields for callers that want to pre-populate a person picker
 * with the signed-in user's own identity.
 */
export async function resolveCurrentPerson(
  supabase: SupabaseClient,
): Promise<CurrentPerson | null> {
  const personId = await resolveCurrentPersonId(supabase);
  if (!personId) return null;

  const { data, error } = await supabase
    .from("people")
    .select("id, name, preferred_name, email, phone")
    .eq("id", personId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CurrentPerson;
}

export type EnsuredPerson = {
  person_id: string;
  name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  email: string | null;
};

/**
 * Resolves the signed-in user to a people row, creating one from their auth
 * metadata if they don't have one yet (ensure_current_person RPC).
 *
 * Use this wherever a signed-in user needs to be assignable or nameable --
 * every owner column in the portal references public.people, so a portal
 * account with no people row can't be assigned anything. Returns null when
 * signed out.
 */
export async function ensureCurrentPerson(
  supabase: SupabaseClient,
): Promise<EnsuredPerson | null> {
  const { data, error } = await supabase.rpc("ensure_current_person");
  if (error) return null;
  const rows = (data ?? []) as EnsuredPerson[];
  return rows[0] ?? null;
}
