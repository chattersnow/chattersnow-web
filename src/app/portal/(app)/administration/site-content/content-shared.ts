import {
  resolveSiteContent,
  SITE_CONTENT_SLOTS,
  type ContentSlot,
  type LegalDocumentContent,
  type ListItem,
  type SiteContent,
  type SiteContentRow,
} from "@/lib/site-content";

/** One `site_content` row as the editor's page reads it (#793). */
export type SiteContentDraftRow = {
  key: string;
  value: unknown;
  draft_value: unknown;
  has_draft: boolean;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
};

/**
 * One slot as the editor gets it.
 *
 * `value` is what the editor edits -- the pending draft where there is one,
 * otherwise what is published, otherwise the registry default. `published` is
 * what the public site is serving right now, which is what the publish diff
 * compares against and what makes "this is not live yet" sayable (#793).
 */
export type EditorSlot = {
  slot: ContentSlot;
  value: unknown;
  published: unknown;
  /** Whether the tenant has a published override rather than the default. */
  overridden: boolean;
  /** Whether a draft is waiting to be published. */
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  /**
   * For a `document` slot, the platform's own document named for this
   * organization -- what the public site serves while the tenant has published
   * none of its own, and what the editor copies in when someone starts from it
   * (#858). Null for every other slot type.
   */
  starter: LegalDocumentContent | null;
};

/**
 * The rows folded two ways: what the public sees, and what the editor edits.
 *
 * A draft whose `draft_value` is null reverts the slot to the registry
 * default, so it contributes no row to the draft fold -- the same shape as a
 * slot nobody has ever touched.
 */
export function resolveDraftAndPublished(
  rows: readonly SiteContentDraftRow[],
): { published: SiteContent; draft: SiteContent } {
  const publishedRows: SiteContentRow[] = [];
  const draftRows: SiteContentRow[] = [];
  for (const row of rows) {
    if (row.value != null) {
      publishedRows.push({ key: row.key, value: row.value });
    }
    const effective = row.has_draft ? row.draft_value : row.value;
    if (effective != null) {
      draftRows.push({ key: row.key, value: effective });
    }
  }
  return {
    published: resolveSiteContent(publishedRows),
    draft: resolveSiteContent(draftRows),
  };
}

/** A slot's value out of a resolved `SiteContent`, whatever shape it is in. */
export function readSlot(slot: ContentSlot, content: SiteContent): unknown {
  switch (slot.type) {
    case "text":
      return content.text(slot.key);
    case "paragraphs":
      return content.paragraphs(slot.key);
    case "list":
      return content.list(slot.key);
    case "document":
      return content.document(slot.key);
    case "image":
      return content.image(slot.key);
  }
}

/**
 * One searchable line per slot, for every page at once.
 *
 * The editor's rail answers "where does this sentence live?", which it can
 * only do if it can see slots on pages other than the one being edited --
 * eighty-six of them across thirteen pages, with no way to find one but to
 * click through the lot (#792). The page already resolves the whole registry
 * to render one page of it, so carrying the rest costs nothing.
 *
 * `text` is the slot's current copy flattened to a single string. It is for
 * matching only; nothing renders it.
 */
export type OutlineEntry = {
  page: string;
  section: string;
  key: string;
  label: string;
  /** Whether the slot is a photo rather than copy, for the rail's wording. */
  image: boolean;
  /** Whether the tenant has set this slot, rather than taking the default. */
  overridden: boolean;
  /** Whether the slot carries a draft the public site has not seen yet. */
  hasDraft: boolean;
  text: string;
};

function listText(items: ListItem[]): string {
  return items
    .flatMap((item) => Object.values(item))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .join(" ");
}

function documentText(doc: LegalDocumentContent | null): string {
  if (!doc) return "";
  return [
    doc.title,
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ].join(" ");
}

/** A slot's current copy as one string, whatever shape it is stored in. */
export function slotText(slot: ContentSlot, content: SiteContent): string {
  switch (slot.type) {
    case "text":
      return content.text(slot.key);
    case "paragraphs":
      return content.paragraphs(slot.key).join(" ");
    case "list":
      return listText(content.list(slot.key));
    case "document":
      return documentText(content.document(slot.key));
    case "image":
      // The label is what a photo is found by; the URL lets a Drive id match.
      return content.image(slot.key) ?? "";
  }
}

export function buildOutline(
  draft: SiteContent,
  published: SiteContent,
  draftKeys: ReadonlySet<string>,
): OutlineEntry[] {
  return SITE_CONTENT_SLOTS.map((slot) => ({
    page: slot.page,
    section: slot.section,
    key: slot.key,
    label: slot.label,
    image: slot.type === "image",
    overridden: published.overrides.has(slot.key),
    hasDraft: draftKeys.has(slot.key),
    // Search runs over the copy being edited rather than the published copy:
    // the rail exists to find the sentence you are working on.
    text: slotText(slot, draft),
  }));
}
