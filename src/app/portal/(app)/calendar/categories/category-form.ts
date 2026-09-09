import type { ParseResult } from "@/lib/forms";

export type CalendarCategoryFormData = {
  label: string;
  sort_order: number;
  is_active: boolean;
};

/**
 * Machine token for a new category.
 *
 * `key` is what the public and portal views join on -- `public_calendar_items`
 * tags events with `own_events`, `calendar_item_categories` carries it as a
 * composite foreign key, and every tagged item references it. So it is derived
 * once at creation and never re-derived on rename: renaming "Our events" to
 * "Chatter events" must not orphan every item already tagged with it. The
 * label is the part an organization owns; the key is the platform's (#834).
 *
 * A label with nothing sluggable in it ("!!!", or one written in a non-Latin
 * script) slugifies to the empty string, which the `key ~ '^[a-z0-9]+...'`
 * check rejects with a constraint error nobody can read, so the parser refuses
 * it up front.
 */
export function slugifyCalendarCategoryKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSortOrder(raw: FormDataEntryValue | null): number | null {
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

export function parseCalendarCategoryForm(
  formData: FormData,
): ParseResult<CalendarCategoryFormData> {
  const label = String(formData.get("label") ?? "").trim();

  if (!label) return { error: "Category name is required." };
  if (!slugifyCalendarCategoryKey(label)) {
    return { error: "Category name must include a letter or number." };
  }

  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sortOrder === null) {
    return { error: "Sort order must be a positive number." };
  }

  return {
    data: {
      label,
      sort_order: sortOrder,
      is_active: formData.get("isActive") !== "off",
    },
  };
}
