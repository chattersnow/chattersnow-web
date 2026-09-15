import { publicRead, unwrap } from "@/lib/api/handler";

/** The tenant's article collections, in the order it arranged them (#894). */
const route = publicRead(async ({ supabase }) => ({
  categories:
    unwrap(
      await supabase
        .from("public_article_categories")
        .select("id, slug, value, position")
        .order("position", { ascending: true }),
    ) ?? [],
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
