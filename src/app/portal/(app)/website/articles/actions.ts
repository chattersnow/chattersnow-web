"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import {
  isValidArticleBody,
  isValidArticleCategoryBody,
  isValidArticleSlug,
} from "@/lib/articles";

export type ArticleActionResult = { error: string } | { success: true };
export type SaveArticlesResult = { error: string } | { categoryId: string };

/**
 * `value` is `unknown` on purpose: it arrives from a client component, so the
 * type guards below are the only thing that knows its shape, and typing it as
 * `ArticleBody` here would make them look redundant when they are the whole
 * defence.
 */
export type CategoryDraftInput = {
  /** Absent for a category being created. */
  id?: string;
  slug: string;
  value: unknown;
};

export type ArticleDraftInput = {
  id?: string;
  anchor: string;
  value: unknown;
};

const ARTICLES_PATH = "/portal/website/articles";

/**
 * Stages a category and its whole ordered article list as drafts (#894).
 *
 * Saving is not publishing, exactly as in the slot editor next door: this
 * writes `draft_value`, which nothing on the public site reads. Every body is
 * checked against `src/lib/articles.ts` first -- the public pages read the
 * published rows with no session behind them, so a malformed body has to be
 * refused here rather than discovered by a visitor -- and the slug and anchor
 * patterns are checked here too, so a bad address comes back as a sentence
 * rather than as a constraint violation.
 *
 * The whole list travels, not a delta: position is the array index, and an
 * article the list no longer names becomes a pending removal.
 */
export async function saveArticleDraftsAction(
  category: CategoryDraftInput,
  articles: ArticleDraftInput[],
): Promise<SaveArticlesResult> {
  if (!isValidArticleSlug(category.slug)) {
    return {
      error:
        "A category's web address must be lowercase words joined by hyphens, like getting-started.",
    };
  }
  if (!isValidArticleCategoryBody(category.value)) {
    return { error: "The category has the wrong shape and was not saved." };
  }
  if (!category.value.title.trim()) {
    return { error: "A category needs a title." };
  }

  const anchors = new Set<string>();
  for (const article of articles) {
    if (!isValidArticleBody(article.value)) {
      return {
        error: `"${article.anchor}" has the wrong shape and was not saved.`,
      };
    }
    const name = article.value.title.trim() || article.anchor;
    if (!article.value.title.trim()) {
      return { error: "Every article needs a title." };
    }
    if (!isValidArticleSlug(article.anchor)) {
      return {
        error: `"${name}" needs a link address of lowercase words joined by hyphens.`,
      };
    }
    if (anchors.has(article.anchor)) {
      return {
        error: `Two articles share the link address "${article.anchor}"; each one needs its own.`,
      };
    }
    anchors.add(article.anchor);
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("save_article_drafts", {
    p_category: {
      id: category.id ?? null,
      slug: category.slug,
      value: category.value,
    },
    p_articles: articles.map((article) => ({
      id: article.id ?? null,
      anchor: article.anchor,
      value: article.value,
    })),
  });
  if (error || typeof data !== "string") {
    return { error: "Could not save the draft. Please try again." };
  }

  // The portal reads its own writes; the public site is untouched until
  // publish, so nothing there needs revalidating.
  revalidatePath(ARTICLES_PATH, "layout");
  return { categoryId: data };
}

/** Publishes a category and its articles' drafts to the public site. */
export async function publishArticleCategoryAction(
  id: string,
): Promise<ArticleActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("publish_article_category", {
    p_id: id,
  });
  if (error) {
    return { error: "Could not publish this category. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/** Drops the pending drafts on a category, leaving what is published alone. */
export async function discardArticleDraftsAction(
  id: string,
): Promise<ArticleActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("discard_article_drafts", { p_id: id });
  if (error) {
    return { error: "Could not discard the draft. Please try again." };
  }

  revalidatePath(ARTICLES_PATH, "layout");
  return { success: true };
}

/**
 * Stages the removal of a category and everything on it.
 *
 * A category that was never published goes immediately; a published one is
 * removed by the next publish, so taking a live page down is a publish like
 * any other change rather than a side effect of a button in a list.
 */
export async function deleteArticleCategoryAction(
  id: string,
): Promise<ArticleActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("delete_article_category", {
    p_id: id,
  });
  if (error) {
    return { error: "Could not remove this category. Please try again." };
  }

  revalidatePath(ARTICLES_PATH, "layout");
  return { success: true };
}

/** Stages the order of the Learn index itself. */
export async function reorderArticleCategoriesAction(
  ids: string[],
): Promise<ArticleActionResult> {
  if (ids.length === 0) return { success: true };

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("reorder_article_categories", {
    p_ids: ids,
  });
  if (error) {
    return { error: "Could not reorder the categories. Please try again." };
  }

  revalidatePath(ARTICLES_PATH, "layout");
  return { success: true };
}
