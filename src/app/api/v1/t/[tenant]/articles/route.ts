import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * Every published article, grouped under the category that owns it.
 *
 * `value` is the article body in the portable block format `src/lib/articles.ts`
 * describes -- the same JSON the site renders, not HTML, so a consumer can lay
 * it out in its own design.
 */
const route = publicRead(async ({ supabase }) => {
  const [categories, articles] = await Promise.all([
    supabase
      .from("public_article_categories")
      .select("id, slug, value, position")
      .order("position", { ascending: true }),
    supabase
      .from("public_articles")
      .select("id, category_id, anchor, value, position")
      .order("position", { ascending: true }),
  ]);

  const articleRows = unwrap(articles) ?? [];

  return {
    categories: (unwrap(categories) ?? []).map((category) => ({
      ...category,
      articles: articleRows
        .filter((article) => article.category_id === category.id)
        .map(({ category_id: _category_id, ...article }) => article),
    })),
  };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
