import type { SupabaseClient } from "@supabase/supabase-js";

type Attributed = {
  draft_updated_by: string | null;
  published_by: string | null;
};

/**
 * The people named on this tenant's article rows, by id, for the attribution
 * lines. The same shape the slot editor's `actorNames` has: the ids on a row
 * are useless without names, and `list_portal_users()` needs
 * `administration:manage`, which a `site_content:manage` holder need not have.
 */
export async function articleActorNames(
  supabase: SupabaseClient,
  rows: readonly Attributed[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((row) => [row.draft_updated_by, row.published_by])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const { data } = await supabase.rpc("list_article_actors", {
    p_user_ids: ids,
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
