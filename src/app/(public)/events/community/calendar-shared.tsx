export type PublicCalendarItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  summary: string | null;
  categories: string[] | null;
  public_url: string | null;
};

/**
 * A category as the resolved tenant words it, from `public_calendar_categories`.
 *
 * This was a hardcoded six-entry list, which is how one organization's
 * vocabulary reached every tenant's visitors: the filter below offered "Chatter
 * events", "LGBTQ+ community" and "Winter & outdoor sports" on any customer's
 * public site from the day they were provisioned (#834). The page reads the
 * tenant's own rows instead.
 */
export type PublicCalendarCategory = { key: string; label: string };

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
