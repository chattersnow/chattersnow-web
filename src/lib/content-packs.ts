/**
 * Platform-authored content packs (#895).
 *
 * #894 turned Learn into rows a tenant owns, which makes the platform tenant
 * simply another author -- and that is where the reusable thing lives. A
 * **pack** is a named set of article categories owned by a tenant on the
 * `internal` plan and offered to the others.
 *
 * Adoption is a **copy**: the adopting tenant gets its own rows, as drafts, and
 * owns them from that moment. Rendering the platform's rows through an override
 * layer instead would mean a platform edit silently rewriting a nonprofit's
 * published page under that nonprofit's byline -- the failure mode #858 removed
 * from the legal defaults, not to be reintroduced one surface over. The price is
 * that there are **no upstream updates**, and that price is the deal: the types
 * below carry no version and no link back, because after the copy there is
 * nothing upstream to link to.
 *
 * Imported by client components, so it stays free of server-only imports.
 */

import { isValidArticleSlug, articleSlugify } from "@/lib/articles";

/** A pack the platform tenant owns, as its own Administration screen sees it. */
export type ContentPack = {
  id: string;
  key: string;
  name: string;
  description: string;
  /** Whether other tenants are shown it. False while it is being written. */
  isOffered: boolean;
  /** Categories currently labelled with this pack, published or not. */
  categoryCount: number;
};

/** A pack another tenant may take, as `available_content_packs()` serves it. */
export type AvailableContentPack = {
  id: string;
  key: string;
  name: string;
  description: string;
  /** Published categories an adopter would receive -- not drafts. */
  categoryCount: number;
  articleCount: number;
  /** When this tenant last adopted it, or null if it never has. */
  adoptedAt: string | null;
};

export type AvailableContentPackRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_count: number | null;
  article_count: number | null;
  adopted_at: string | null;
};

export function toAvailableContentPack(
  row: AvailableContentPackRow,
): AvailableContentPack {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    categoryCount: row.category_count ?? 0,
    articleCount: row.article_count ?? 0,
    adoptedAt: row.adopted_at,
  };
}

/**
 * A pack key is a slug, the same shape and the same database `check` as a
 * category's address, so the editor can offer the answer the constraint would
 * give rather than letting a save fail on it.
 */
export const contentPackSlugify = articleSlugify;
export const isValidContentPackKey = isValidArticleSlug;

/** What `adopt_content_pack()` reports back about the copy it made. */
export type AdoptionSummary = {
  packName: string;
  categories: number;
  articles: number;
};

export function toAdoptionSummary(value: unknown): AdoptionSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.pack_name !== "string") return null;
  return {
    packName: record.pack_name,
    categories: typeof record.categories === "number" ? record.categories : 0,
    articles: typeof record.articles === "number" ? record.articles : 0,
  };
}

/**
 * The slugs a failed adoption named, or null when the failure was something
 * else.
 *
 * `copy_content_pack()` refuses the whole adoption when a category's address is
 * already in use rather than renaming around it -- an address is identity, and
 * quietly publishing a guide at a different URL than the one the pack was
 * written for is worse than saying so. This turns the raised message back into
 * the list, so the message the editor reads names the pages to rename.
 */
export function takenSlugsFromError(message: string): string[] | null {
  const match = /SLUG_TAKEN:\s*(.+)$/.exec(message);
  if (!match) return null;
  return match[1]
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}
