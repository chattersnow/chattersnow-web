/**
 * The article collection behind /learn (#894).
 *
 * The slot registry in `src/lib/site-content.ts` is a fixed list: a known key,
 * a known type, a default. That is the right shape for "the hero headline" and
 * it structurally cannot hold Learn, which needs an *unbounded* number of rows
 * a tenant creates -- categories, each with its own slug, and articles within
 * them, each with its own anchor and ordered body. So articles are their own
 * two tables rather than more slots, and this module is the shape both the
 * public pages and the editor agree on.
 *
 * Until this ticket the categories and articles were eight `*-data.ts` files
 * under `src/app/(public)/learn/` -- 1,913 lines of one tenant's snow-sports
 * writing compiled into the bundle. `learn` was gated `defaultVisible: false`,
 * which gave a second organization exactly two options: publish somebody
 * else's guides under their own brand, or have no Learn section at all.
 *
 * **This is not a rich text editor.** The body below is the shape the pages
 * already rendered and nothing more; paragraphs, a labelled list, links and a
 * disclaimer. Markup beyond that is a change to `ArticleBody`, argued on its
 * own merits.
 *
 * Drafting works exactly as it does for site content (#793): `value` is what
 * the public sees, `draft_value` behind `has_draft` is the pending change, and
 * the only writer of either is a `security definer` function. The one thing
 * that has no equivalent there is *deletion*, because an article has no
 * registry default to fall back to -- a draft of `null` is therefore a pending
 * removal, and publishing it drops the row.
 *
 * Imported by the editor, a client component, so it stays free of server-only
 * imports; the reads live in `src/lib/public-articles.ts`.
 */

export type ArticleListItem = {
  label: string;
  text: string;
};

export type ArticleLink = {
  label: string;
  href: string;
  /**
   * Whether the link points into this site rather than out of it. Internal
   * links are filtered against page visibility before they render -- see
   * `LearnArticleSections`.
   */
  internal?: boolean;
};

/** An article's words: the half of a row that is drafted and published. */
export type ArticleBody = {
  title: string;
  description: string;
  paragraphs: string[];
  list: ArticleListItem[];
  links: ArticleLink[];
  disclaimer: string;
};

/** A category's words. Its slug is identity, and lives outside the draft. */
export type ArticleCategoryBody = {
  title: string;
  description: string;
};

/** A published article, as the public pages and the editor both see it. */
export type Article = ArticleBody & {
  id: string;
  /** The `#fragment` the in-page nav links to, unique within its category. */
  anchor: string;
};

export type ArticleCategory = ArticleCategoryBody & {
  id: string;
  /** The `/learn/<slug>` segment, unique within the tenant. */
  slug: string;
};

export type ArticleCategoryWithArticles = ArticleCategory & {
  articles: Article[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isListItem(value: unknown): value is ArticleListItem {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.text === "string"
  );
}

function isLink(value: unknown): value is ArticleLink {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.href === "string" &&
    (value.internal === undefined || typeof value.internal === "boolean")
  );
}

/**
 * Whether a stored body has the shape the renderer expects.
 *
 * Checked on the way in, so a malformed body is refused by the action rather
 * than discovered by a visitor, and on the way out, so a row edited by hand is
 * skipped instead of crashing the page. There is no default to fall back to,
 * which is why a bad row is dropped rather than replaced.
 */
export function isValidArticleBody(value: unknown): value is ArticleBody {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isStringArray(value.paragraphs) &&
    Array.isArray(value.list) &&
    value.list.every(isListItem) &&
    Array.isArray(value.links) &&
    value.links.every(isLink) &&
    typeof value.disclaimer === "string"
  );
}

export function isValidArticleCategoryBody(
  value: unknown,
): value is ArticleCategoryBody {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.description === "string"
  );
}

export function emptyArticleBody(): ArticleBody {
  return {
    title: "",
    description: "",
    paragraphs: [],
    list: [],
    links: [],
    disclaimer: "",
  };
}

export function emptyArticleCategoryBody(): ArticleCategoryBody {
  return { title: "", description: "" };
}

/**
 * The slug/anchor form the database `check` constraints enforce: lowercase
 * words joined by single hyphens. Kept here so the editor can offer the same
 * answer the constraint would give, rather than letting a save fail on it.
 */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function articleSlugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidArticleSlug(value: string): boolean {
  return ARTICLE_SLUG_PATTERN.test(value);
}

/** One `article_categories` or `articles` row as the public views serve it. */
export type ArticleRow = {
  id: string;
  value: unknown;
};

export type ArticleCategoryRow = ArticleRow & { slug: string };
export type PublicArticleRow = ArticleRow & {
  category_id: string;
  anchor: string;
};

/**
 * Folds published rows into renderable categories. Rows whose body does not
 * parse are dropped, in both directions: a category with a broken body takes
 * its articles with it, because there is no page left to show them on.
 */
export function resolveArticleCategories(
  categoryRows: readonly ArticleCategoryRow[],
  articleRows: readonly PublicArticleRow[] = [],
): ArticleCategoryWithArticles[] {
  const articlesByCategory = new Map<string, Article[]>();
  for (const row of articleRows) {
    if (!isValidArticleBody(row.value)) continue;
    const list = articlesByCategory.get(row.category_id) ?? [];
    list.push({ ...row.value, id: row.id, anchor: row.anchor });
    articlesByCategory.set(row.category_id, list);
  }

  return categoryRows.flatMap((row) => {
    if (!isValidArticleCategoryBody(row.value)) return [];
    return [
      {
        ...row.value,
        id: row.id,
        slug: row.slug,
        articles: articlesByCategory.get(row.id) ?? [],
      },
    ];
  });
}
