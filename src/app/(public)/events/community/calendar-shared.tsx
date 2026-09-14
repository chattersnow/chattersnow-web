import type { NonNullColumns, Views } from "@/lib/supabase/types";

/**
 * One row of `public_calendar_items`, as the community calendar reads it --
 * derived from the generated view row (#813 Phase 1), minus the `item_type`
 * the page does not select.
 *
 * The four narrowed columns are `not null` on `calendar_items`, and the view's
 * second `union all` branch fills all four from `events`, which requires them
 * too. `categories` stays nullable on purpose: it is an `array_agg` subquery,
 * which answers null rather than an empty array for an item with no tags.
 */
export type PublicCalendarItem = NonNullColumns<
  Omit<Views<"public_calendar_items">, "item_type">,
  "id" | "title" | "starts_at" | "time_zone"
>;

/**
 * A category as the resolved tenant words it, from `public_calendar_categories`.
 *
 * This was a hardcoded six-entry list, which is how one organization's
 * vocabulary reached every tenant's visitors: the filter below offered "Chatter
 * events", "LGBTQ+ community" and "Winter & outdoor sports" on any customer's
 * public site from the day they were provisioned (#834). The page reads the
 * tenant's own rows instead.
 */
export type PublicCalendarCategory = NonNullColumns<
  Omit<Views<"public_calendar_categories">, "sort_order">,
  "key" | "label"
>;

/**
 * Falls back to the raw key rather than hiding the value. A category can be
 * deactivated while items are still tagged with it, and showing the key is a
 * legible "this exists but has no name any more" -- rendering nothing would
 * silently drop a filter chip.
 */
export function categoryLabel(
  categories: readonly PublicCalendarCategory[],
  value: string,
): string {
  return categories.find((category) => category.key === value)?.label ?? value;
}
