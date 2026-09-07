import type { ContentSlot, ListField, ListItem } from "@/lib/site-content";

/**
 * Paragraphs travel through a textarea as blank-line-separated blocks, which
 * means a single newline is silently dropped. The rule was written in a field
 * description and then only observable on the published page, so the editor
 * now counts the blocks back as you type (#792).
 */
export function paragraphsToText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

export function textToParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function paragraphHint(paragraphs: string[]): string {
  const count = paragraphs.length;
  if (count === 0) return "Separate paragraphs with a blank line.";
  const noun = count === 1 ? "paragraph" : "paragraphs";
  return `${count} ${noun} — separate them with a blank line.`;
}

export function emptyListItem(fields: readonly ListField[]): ListItem {
  return Object.fromEntries(
    fields.map((field) => [field.key, field.kind === "text" ? "" : []]),
  );
}

/**
 * A list item named for a confirmation prompt or a reorder button. The first
 * text field is the item's title on every list in the registry; falling back
 * to the position keeps the control's accessible name unique either way.
 */
export function listItemLabel(
  item: ListItem,
  fields: readonly ListField[],
  index: number,
): string {
  const first = fields.find((field) => field.kind === "text");
  const value = first ? item[first.key] : undefined;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : `Item ${index + 1}`;
}

/**
 * Whether a text slot needs more than one line. Decided from the longer of the
 * registry default and the value the server sent, never from what is being
 * typed -- swapping the control mid-edit would drop the caret. Looking at the
 * default alone left a tenant whose own copy is long editing it in a
 * single-line input forever (#791).
 */
export function isMultiline(
  slot: Extract<ContentSlot, { type: "text" }>,
  initialValue: unknown,
): boolean {
  const longest = Math.max(
    slot.default.length,
    typeof initialValue === "string" ? initialValue.length : 0,
  );
  return longest > 90;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
