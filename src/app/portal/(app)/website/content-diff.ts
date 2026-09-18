import { parseImageCrop, type ImageCrop } from "@/lib/image-crop";
import type { Json } from "@/lib/supabase/types";
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
      return imageLines(value);
  }
}

/**
 * A photo as the link and, separately, the crop on it.
 *
 * The stored string carries its crop as a `#crop=x,y,w,h` fragment (#1250), so
 * returning it whole made a crop-only change read as two near-identical
 * 120-character URLs with four decimals of difference somewhere in the tail --
 * unreadable as a URL and useless as a description of what moved. Split, the
 * link stays stable between the two sides and the sentence is the change.
 */
function imageLines(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  const { src, crop } = parseImageCrop(value);
  const lines = src ? [src] : [];
  return crop ? [...lines, cropLine(crop)] : lines;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The rect in words: how much of the photo is shown, and which part of it. */
function cropLine(crop: ImageCrop): string {
  return `Crop: ${percent(crop.w)} × ${percent(crop.h)} of the photo, centred ${percent(
    crop.x + crop.w / 2,
  )} across and ${percent(crop.y + crop.h / 2)} down.`;
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
  /**
   * For an `image` slot, the crop each side carries -- which the lines above
   * deliberately describe in words rather than hand on as a URL fragment, and
   * which the publish dialog needs as a rect to draw the two pictures cropped
   * (#1251). Null on both sides for every other kind of slot.
   */
  beforeCrop: ImageCrop | null;
  afterCrop: ImageCrop | null;
};

/** The crop on a slot's value, for the two sides of a photo change. */
function cropOf(slot: ContentSlot, value: unknown): ImageCrop | null {
  if (slot.type !== "image" || typeof value !== "string") return null;
  return parseImageCrop(value).crop;
}

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
      beforeCrop: cropOf(slot, published),
      afterCrop: cropOf(slot, value),
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
export function draftValueFor(slot: ContentSlot, value: Json): Json {
  return isSame(value, slot.default) ? null : value;
}
