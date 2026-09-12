import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContentPack } from "@/lib/content-packs";
import {
  ARTICLE_CATEGORY_DRAFT_COLUMNS,
  byPosition,
  toEditorCategory,
  type ArticleCategoryDraftRow,
} from "../article-shared";
import { PackManager, type PackCategory } from "./pack-manager";

export const metadata: Metadata = {
  title: "Content packs",
};

type PackRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_offered: boolean;
};

type CategoryRow = ArticleCategoryDraftRow & { pack_id: string | null };

/**
 * Authoring the packs this platform offers (#895).
 *
 * Platform tenant only, and `platform_tenants:manage` is the whole gate:
 * `my_permissions()` reports that resource as `none` unless
 * `is_platform_operator()` holds -- membership kind and the `internal` plan
 * included -- so there is no second condition to check here. A pack authored
 * anywhere else would never appear in anyone's catalog, because
 * `available_content_packs()` requires an `internal` owner.
 */
export default async function ContentPacksPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "platform_tenants", "manage")) notFound();

  const [packResult, categoryResult] = await Promise.all([
    supabase
      .from("content_packs")
      .select("id, key, name, description, is_offered")
      .order("name"),
    supabase
      .from("article_categories")
      .select(`${ARTICLE_CATEGORY_DRAFT_COLUMNS}, pack_id`),
  ]);

  const categoryRows = (categoryResult.data ?? []) as CategoryRow[];
  const categories: PackCategory[] = byPosition(
    categoryRows.map((row) => {
      const editor = toEditorCategory(row, [], new Map());
      return {
        id: editor.id,
        slug: editor.slug,
        position: editor.position,
        title: editor.body.title || editor.slug,
        published: !editor.unpublished,
        packId: row.pack_id,
      };
    }),
  );

  const packs: ContentPack[] = ((packResult.data ?? []) as PackRow[]).map(
    (row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description ?? "",
      isOffered: row.is_offered,
      categoryCount: categories.filter((entry) => entry.packId === row.id)
        .length,
    }),
  );

  return (
    <PackManager
      packs={packs}
      categories={categories}
      loadError={
        packResult.error
          ? "Could not load the packs. Reload to try again."
          : null
      }
    />
  );
}
