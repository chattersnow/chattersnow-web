import type { Metadata } from "next";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPageVisibility } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CategoryList } from "./category-list";
import {
  ARTICLE_CATEGORY_DRAFT_COLUMNS,
  ARTICLE_DRAFT_COLUMNS,
  byPosition,
  toEditorCategory,
  type ArticleCategoryDraftRow,
  type ArticleDraftRow,
} from "./article-shared";
import { articleActorNames } from "./article-actors";

export const metadata: Metadata = {
  title: "Articles",
};

export default async function ArticlesPage() {
  const supabase = await createSupabaseServerClient();
  const [permissions, categoryResult, articleResult, visibility] =
    await Promise.all([
      getCurrentUserPermissions(supabase),
      supabase
        .from("article_categories")
        .select(ARTICLE_CATEGORY_DRAFT_COLUMNS),
      supabase.from("articles").select(ARTICLE_DRAFT_COLUMNS),
      getPageVisibility(supabase),
    ]);

  const categoryRows = (categoryResult.data ?? []) as ArticleCategoryDraftRow[];
  const articleRows = (articleResult.data ?? []) as ArticleDraftRow[];
  const actors = await articleActorNames(supabase, [
    ...categoryRows,
    ...articleRows,
  ]);

  const categories = byPosition(
    categoryRows.map((row) =>
      toEditorCategory(
        row,
        articleRows.filter((article) => article.category_id === row.id),
        actors,
      ),
    ),
  );

  return (
    <CategoryList
      categories={categories}
      canEdit={hasPermission(permissions, "site_content", "manage")}
      // Writing guides for a section nobody can reach is possible and gives no
      // hint of it otherwise; the same warning the slot editor carries (#792).
      learnHidden={visibility.learn === false}
    />
  );
}
