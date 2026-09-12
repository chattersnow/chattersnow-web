import type {
  ContentSlot,
  LegalDocumentContent,
  ListField,
  ListItem,
} from "@/lib/site-content";

/**
 * A slot's value flattened to the lines a person reads, so two versions of it
 * can be put side by side (#793).
 *
 * `audit-log/diff.ts#computeDiff` is a shallow diff over the keys of one
 * database row, which is the wrong shape here: a content slot is a string, a
 * list of paragraphs, a list of records, or a whole legal document, and what
 * an editor wants to see before publishing is the copy, not the JSON.
 */
export function slotLines(slot: ContentSlot, value: unknown): string[] {
  switch (slot.type) {
    case "text":
      return typeof value === "string" && value ? [value] : [];
    case "paragraphs":
      return Array.isArray(value) ? (value as string[]) : [];
    case "list":
      return Array.isArray(value)
        ? (value as ListItem[]).map((item) => itemLine(item, slot.fields))
        : [];
    case "document":
      return documentLines(value as LegalDocumentContent | null);
    case "image":
      return typeof value === "string" && value ? [value] : [];
  }
}

/**
 * Walks the registry's fields rather than the row's own keys, because a
 * `boolean` field has to be named to mean anything: an unlabelled `false`
 * drops out of a truthiness filter, so switching a link off would have read as
 * "nothing changed" in the publish dialog and published silently (#937).
 */
function itemLine(item: ListItem, fields: readonly ListField[]): string {
  return fields
    .map((field) => {
      const value = item[field.key];
      if (field.kind === "boolean") {
        return `${field.label}: ${value === false ? "no" : "yes"}`;
      }
      if (Array.isArray(value)) return value.join(", ");
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean)
    .join(" — ");
}

function documentLines(doc: LegalDocumentContent | null): string[] {
  if (!doc) return [];
  return [
    doc.title,
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ].filter(Boolean);
}

export type SlotChange = {
  slot: ContentSlot;
  before: string[];
  after: string[];
  /** True when publishing this slot removes the override and restores the default. */
  toDefault: boolean;
};

/**
 * What publishing these slots would change, for the confirmation dialog.
 *
 * Slots whose draft reads identically to what is published are dropped: a
 * whitespace-only edit is not worth a line in a list of what is going live.
 */
export function slotChanges(
  slots: readonly {
    slot: ContentSlot;
    value: unknown;
    published: unknown;
  }[],
): SlotChange[] {
  return slots
    .map(({ slot, value, published }) => ({
      slot,
      before: slotLines(slot, published),
      after: slotLines(slot, value),
      toDefault: isSame(value, slot.default),
    }))
    .filter((change) => !isSame(change.before, change.after));
}

function isSame(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * What a save should store for a slot: `null` where the editor has put the
 * registry default back, so the draft reverts the slot rather than storing a
 * copy of the default as if it were the tenant's own words.
 */
export function draftValueFor(slot: ContentSlot, value: unknown): unknown {
  return isSame(value, slot.default) ? null : value;
}
