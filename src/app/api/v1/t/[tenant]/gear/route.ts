import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * The lending library: every available item, newest first.
 *
 * The four filters are the four the organization's own catalogue offers, by
 * the same rules -- `category` and `condition` and `gender` match exactly,
 * `q` is a case-insensitive substring of the description. The difference is
 * where they run: the site ships the whole list to the browser and filters
 * there, which a consumer on a slow connection should not have to do, so these
 * are applied in Postgres.
 */
const route = publicRead(async ({ supabase, searchParams }) => {
  let query = supabase
    .from("public_gear_catalog")
    .select(
      "id, description, size, type, gender, condition, photo_url, created_at, category_key, category_label, category_group_key, category_group_label, category_sort_order, category_group_sort_order",
    )
    .order("created_at", { ascending: false });

  const category = searchParams.get("category")?.trim();
  const condition = searchParams.get("condition")?.trim();
  const gender = searchParams.get("gender")?.trim();
  const search = searchParams.get("q")?.trim();

  if (category) query = query.eq("category_key", category);
  if (condition) query = query.eq("condition", condition);
  if (gender) query = query.eq("gender", gender);
  // `%` and `_` are wildcards to LIKE, so a search for "50%" would otherwise
  // match everything. PostgREST has no bind parameter here to lean on.
  if (search) {
    query = query.ilike(
      "description",
      `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`,
    );
  }

  return { items: unwrap(await query) ?? [] };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
