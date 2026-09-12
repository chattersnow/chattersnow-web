import {
  emptyArticleBody,
  emptyArticleCategoryBody,
  isValidArticleBody,
  isValidArticleCategoryBody,
  type ArticleBody,
  type ArticleCategoryBody,
} from "@/lib/articles";

/** One `article_categories` row as the editor reads it (#894). */
export type ArticleCategoryDraftRow = {
  id: string;
  slug: string;
  position: number;
  draft_position: number | null;
  value: unknown;
  draft_value: unknown;
  has_draft: boolean;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
};

export type ArticleDraftRow = Omit<ArticleCategoryDraftRow, "slug"> & {
  category_id: string;
  anchor: string;
};

/** The columns both reads select, so the page and its editor cannot drift. */
export const ARTICLE_DRAFT_COLUMNS =
  "id, category_id, anchor, position, draft_position, value, draft_value, has_draft, draft_updated_at, draft_updated_by, published_at, published_by";

export const ARTICLE_CATEGORY_DRAFT_COLUMNS =
  "id, slug, position, draft_position, value, draft_value, has_draft, draft_updated_at, draft_updated_by, published_at, published_by";

type DraftRow = {
  value: unknown;
  draft_value: unknown;
  has_draft: boolean;
  position: number;
  draft_position: number | null;
};

/**
 * Whether a row is staged for removal: it has a draft, that draft is nothing,
 * and there is something published for it to take away.
 *
 * A draft of NULL is the only shape a deletion has here -- an article has no
 * registry default to revert to, so "no pending value" can only mean "gone
 * once this is published". See the migration's header.
 */
export function isPendingRemoval(row: DraftRow): boolean {
  return row.has_draft && row.draft_value == null && row.value != null;
}

/** Whether nothing of this row has ever reached the public site. */
export function isUnpublished(row: DraftRow): boolean {
  return row.value == null;
}

/** The order the editor shows: the pending one where there is one. */
export function effectivePosition(row: DraftRow): number {
  return row.draft_position ?? row.position;
}

/** The body the editor edits: the draft where there is one, else what is live. */
export function effectiveArticleBody(row: DraftRow): ArticleBody {
  const raw = row.has_draft ? row.draft_value : row.value;
  return isValidArticleBody(raw) ? raw : emptyArticleBody();
}

export function effectiveCategoryBody(row: DraftRow): ArticleCategoryBody {
  const raw = row.has_draft ? row.draft_value : row.value;
  return isValidArticleCategoryBody(raw) ? raw : emptyArticleCategoryBody();
}

/** What the public site is serving right now, or null when nothing is. */
export function publishedCategoryBody(
  row: DraftRow,
): ArticleCategoryBody | null {
  return isValidArticleCategoryBody(row.value) ? row.value : null;
}

/** A category as the list and the editor both need it. */
export type EditorCategory = {
  id: string;
  slug: string;
  position: number;
  body: ArticleCategoryBody;
  /** The title the public site is serving, for "this is not live yet". */
  publishedTitle: string | null;
  hasDraft: boolean;
  pendingRemoval: boolean;
  unpublished: boolean;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  /** How many articles the category holds, removals excluded. */
  articleCount: number;
  /** Whether any article on it carries a draft the public site has not seen. */
  articlesHaveDrafts: boolean;
};

export type EditorArticle = {
  id: string;
  anchor: string;
  position: number;
  body: ArticleBody;
  hasDraft: boolean;
  pendingRemoval: boolean;
  unpublished: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
};

export function toEditorCategory(
  row: ArticleCategoryDraftRow,
  articles: readonly ArticleDraftRow[],
  actors: ReadonlyMap<string, string>,
): EditorCategory {
  const live = articles.filter((article) => !isPendingRemoval(article));
  return {
    id: row.id,
    slug: row.slug,
    position: effectivePosition(row),
    body: effectiveCategoryBody(row),
    publishedTitle: publishedCategoryBody(row)?.title ?? null,
    hasDraft: row.has_draft,
    pendingRemoval: isPendingRemoval(row),
    unpublished: isUnpublished(row),
    draftUpdatedAt: row.draft_updated_at,
    draftUpdatedBy: row.draft_updated_by
      ? (actors.get(row.draft_updated_by) ?? null)
      : null,
    publishedAt: row.published_at,
    publishedBy: row.published_by
      ? (actors.get(row.published_by) ?? null)
      : null,
    articleCount: live.length,
    articlesHaveDrafts: articles.some((article) => article.has_draft),
  };
}

export function toEditorArticle(
  row: ArticleDraftRow,
  actors: ReadonlyMap<string, string>,
): EditorArticle {
  return {
    id: row.id,
    anchor: row.anchor,
    position: effectivePosition(row),
    body: effectiveArticleBody(row),
    hasDraft: row.has_draft,
    pendingRemoval: isPendingRemoval(row),
    unpublished: isUnpublished(row),
    publishedAt: row.published_at,
    publishedBy: row.published_by
      ? (actors.get(row.published_by) ?? null)
      : null,
  };
}

/**
 * Rows in the order the editor shows them.
 *
 * `position` is only unique per category by convention -- two rows can share
 * one after a reorder that was never published -- so the id breaks the tie and
 * the list stops reshuffling between renders.
 */
export function byPosition<T extends { position: number; id: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
}
