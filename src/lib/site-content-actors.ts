import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The people named on this tenant's `site_content` rows, by id.
 *
 * `site_content` records who drafted, who published and, since #600, who
 * approved each slot, and every one of those is a uuid that is useless in a
 * sentence. `list_site_content_actors` is the narrow lookup that turns them
 * into names: permission-gated on `site_content:view`, and limited to ids the
 * caller's own tenant's rows already name, so it cannot enumerate accounts.
 *
 * Shared by the Site Content editor and the Legal documents panel rather than
 * written twice, since both ask the same question of the same rows. A caller
 * who cannot read the names gets an empty map and says "someone" -- the date
 * is still the answer to most of what these lines are asked.
 */
export async function siteContentActorNames(
  supabase: SupabaseClient,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase.rpc("list_site_content_actors", {
    p_user_ids: unique,
  });
  const actors = (data ?? []) as {
    user_id: string;
    email: string | null;
    full_name: string | null;
  }[];
  return new Map(
    actors.map((actor) => [
      actor.user_id,
      actor.full_name || actor.email || "someone",
    ]),
  );
}
