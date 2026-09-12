import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPageVisibility } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  toAvailableContentPack,
  type AvailableContentPackRow,
} from "@/lib/content-packs";
import { CategoryList } from "./category-list";
import { PackCatalog } from "./pack-catalog";
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
  const [permissions, categoryResult, articleResult, visibility, packResult] =
    await Promise.all([
      getCurrentUserPermissions(supabase),
      supabase
        .from("article_categories")
        .select(ARTICLE_CATEGORY_DRAFT_COLUMNS),
      supabase.from("articles").select(ARTICLE_DRAFT_COLUMNS),
      getPageVisibility(supabase),
      // The one read here that crosses tenants: what the platform is offering
      // this organization (#895). It answers with names and counts only, and
      // only for packs a tenant on the `internal` plan has switched on.
      supabase.rpc("available_content_packs"),
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

  const canEdit = hasPermission(permissions, "site_content", "manage");
  // `my_permissions()` reports platform_tenants as `none` outside the platform
  // tenant, so this is the whole "is this the platform" question.
  const canAuthorPacks = hasPermission(
    permissions,
    "platform_tenants",
    "manage",
  );

  return (
    <>
      <CategoryList
        categories={categories}
        canEdit={canEdit}
        // Writing guides for a section nobody can reach is possible and gives no
        // hint of it otherwise; the same warning the slot editor carries (#792).
        learnHidden={visibility.learn === false}
      />

      {canAuthorPacks && (
        <p className="mt-6 max-w-3xl text-sm">
          <Link
            href="/portal/website/articles/packs"
            className="inline-flex items-center gap-1.5 underline underline-offset-4"
          >
            <Package className="size-3.5" />
            Content packs
          </Link>
          <span className="app-muted">
            {" "}
            — the sets of these categories other organizations may copy.
          </span>
        </p>
      )}

      <PackCatalog
        packs={((packResult.data ?? []) as AvailableContentPackRow[]).map(
          toAvailableContentPack,
        )}
        canAdopt={canEdit}
      />
    </>
  );
}
