import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { articleActorNames } from "../article-actors";
import {
  ARTICLE_CATEGORY_DRAFT_COLUMNS,
  ARTICLE_DRAFT_COLUMNS,
  byPosition,
  isPendingRemoval,
  toEditorArticle,
  toEditorCategory,
  type ArticleCategoryDraftRow,
  type ArticleDraftRow,
} from "../article-shared";
import { CategoryEditor } from "./category-editor";

export const metadata: Metadata = {
  title: "Articles",
};

export default async function ArticleCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [permissions, categoryResult, articleResult] = await Promise.all([
    getCurrentUserPermissions(supabase),
    supabase
      .from("article_categories")
      .select(ARTICLE_CATEGORY_DRAFT_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("articles")
      .select(ARTICLE_DRAFT_COLUMNS)
      .eq("category_id", id),
  ]);

  const categoryRow = categoryResult.data as ArticleCategoryDraftRow | null;
  if (!categoryRow) notFound();

  // Rows staged for removal are already gone as far as the editor is
  // concerned: they exist only so the deletion can travel through publish.
  const articleRows = ((articleResult.data ?? []) as ArticleDraftRow[]).filter(
    (row) => !isPendingRemoval(row),
  );

  const actors = await articleActorNames(supabase, [
    categoryRow,
    ...articleRows,
  ]);

  // The editor seeds its form state once and does not reseed from new props,
  // which is what keeps a keyed row's caret where it was. So a save has to
  // remount it, or an article created in this session would keep the id-less
  // draft the server has since given an id to, and the form would read dirty
  // forever. Anything that changes on a save, discard or publish belongs in
  // this key.
  const version = [
    categoryRow.draft_updated_at,
    categoryRow.published_at,
    categoryRow.has_draft,
    ...articleRows.map(
      (row) =>
        `${row.id}:${row.anchor}:${row.draft_updated_at}:${row.published_at}`,
    ),
  ].join("|");

  return (
    <CategoryEditor
      key={version}
      category={toEditorCategory(categoryRow, articleRows, actors)}
      articles={byPosition(
        articleRows.map((row) => toEditorArticle(row, actors)),
      )}
      canEdit={hasPermission(permissions, "site_content", "manage")}
    />
  );
}
