import {
  SITE_CONTENT_SLOTS,
  type ContentSlot,
  type LegalDocumentContent,
  type ListItem,
  type SiteContent,
} from "@/lib/site-content";

/**
 * One slot as the editor gets it: the registry entry, the value in effect --
 * the tenant's own where set, the registry default otherwise -- and which of
 * the two it is, so "back to default" is offered only where it means
 * something.
 */
export type EditorSlot = {
  slot: ContentSlot;
  value: unknown;
  overridden: boolean;
};

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
  /** Whether the tenant has set this slot, rather than taking the default. */
  overridden: boolean;
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
  }
}

export function buildOutline(content: SiteContent): OutlineEntry[] {
  return SITE_CONTENT_SLOTS.map((slot) => ({
    page: slot.page,
    section: slot.section,
    key: slot.key,
    label: slot.label,
    overridden: content.overrides.has(slot.key),
    text: slotText(slot, content),
  }));
}
