import { ApiError } from "@/lib/api/errors";
import { publicRead, unwrap } from "@/lib/api/handler";

/** One category and its articles, by the category's slug. */
const route = publicRead<{ tenant: string; article: string }>(
  async ({ supabase, params }) => {
    const category = unwrap(
      await supabase
        .from("public_article_categories")
        .select("id, slug, value, position")
        .eq("slug", params.article)
        .maybeSingle(),
    );

    // `id` is nullable through the view, as every view column is; a
    // category without one is a category nothing can be hung off.
    if (!category?.id) {
      throw new ApiError("not_found", "No such article category.");
    }

    const articles = unwrap(
      await supabase
        .from("public_articles")
        .select("id, anchor, value, position")
        .eq("category_id", category.id)
        .order("position", { ascending: true }),
    );

    return { category: { ...category, articles: articles ?? [] } };
  },
);

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
