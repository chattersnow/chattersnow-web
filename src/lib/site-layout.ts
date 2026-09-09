import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How the public site is arranged, for the parts that are neither copy nor
 * colour (#846).
 *
 * Page visibility decides whether a section exists at all; these decide how
 * much of it a page shows. Same approach as `PUBLIC_PAGE_SLOTS` in
 * `@/lib/page-visibility` and `BRAND_COLOR_TOKENS` in `@/lib/branding`: adding
 * an entry below is enough to wire a setting up in the admin UI and in the
 * public read, because every slot is just a keyed row in app_settings. The
 * `public_site_layout` view already exposes the whole `layout.*` prefix, so a
 * new slot needs no migration.
 */
export type LayoutOption = {
  /** Stored in app_settings as-is. */
  value: number;
  label: string;
  /** Shown beside the label in the picker, when the label alone is thin. */
  hint?: string;
};

export type LayoutSlot = {
  /** The suffix after `layout.`, and the column the public view exposes. */
  key: string;
  label: string;
  description: string;
  options: readonly LayoutOption[];
  /**
   * Applied when no row exists, when the row is unreadable, and when it holds
   * a value no longer on offer. Production is seeded with no rows at all, so
   * this is what actually decides the layout on a fresh deploy.
   */
  defaultValue: number;
};

export const HOME_UPCOMING_COUNT_SLOT = "home_upcoming_count";

export const LAYOUT_SLOTS: LayoutSlot[] = [
  {
    key: HOME_UPCOMING_COUNT_SLOT,
    label: "Upcoming events on the home page",
    description:
      "How many of the soonest events the home page lists. When fewer than this are upcoming, it shows the ones there are; when none are, it falls back to the next item on the community calendar.",
    defaultValue: 3,
    options: [
      { value: 1, label: "1 event", hint: "A single feature card" },
      { value: 2, label: "2 events" },
      { value: 3, label: "3 events", hint: "Default" },
      { value: 6, label: "6 events", hint: "Two rows" },
    ],
  },
];

const SLOTS_BY_KEY = new Map(LAYOUT_SLOTS.map((slot) => [slot.key, slot]));

/**
 * The largest value any slot offers for the home page's event count. The home
 * page queries this many rows and slices to the tenant's setting, so reading
 * the setting doesn't have to happen before the query and serialise the two.
 */
export const MAX_HOME_UPCOMING_COUNT = Math.max(
  ...(SLOTS_BY_KEY.get(HOME_UPCOMING_COUNT_SLOT)?.options ?? []).map(
    (option) => option.value,
  ),
);

export function layoutSettingKey(slot: string): string {
  return `layout.${slot}`;
}

/** Whether a value is one this slot actually offers. */
export function isLayoutValue(slot: LayoutSlot, value: unknown): boolean {
  return slot.options.some((option) => option.value === value);
}

/** What the public site reads. One field per slot, always populated. */
export type SiteLayout = {
  homeUpcomingCount: number;
};

export type LayoutRow = { slot: string; value: unknown };

/**
 * Folds the tenant's rows over the registry defaults. Pure.
 *
 * Anything that isn't a value the slot offers -- a missing row, a null, a
 * number someone typed straight into the table, a value retired from the
 * options since it was saved -- falls back to the default rather than reaching
 * a page as a layout nobody designed.
 */
export function resolveLayoutValues(
  rows: readonly LayoutRow[],
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const slot of LAYOUT_SLOTS) {
    const row = rows.find((candidate) => candidate.slot === slot.key);
    values[slot.key] = isLayoutValue(slot, row?.value)
      ? (row?.value as number)
      : slot.defaultValue;
  }
  return values;
}

export function resolveLayout(rows: readonly LayoutRow[]): SiteLayout {
  const values = resolveLayoutValues(rows);
  return { homeUpcomingCount: values[HOME_UPCOMING_COUNT_SLOT] };
}

export const DEFAULT_SITE_LAYOUT: SiteLayout = resolveLayout([]);

/**
 * The layout for the tenant the request host resolved to, cached per request
 * the way `getPageVisibility` and `getPublicSite` are -- a page that reads two
 * of these settings should still cost one query.
 */
export const getSiteLayout = cache(
  async (supabase: SupabaseClient): Promise<SiteLayout> => {
    const { data, error } = await supabase
      .from("public_site_layout")
      .select("slot, value");

    // Falling back to the defaults is right -- an unreadable setting must not
    // blank a section -- but it must not be silent. `public_page_visibility`
    // was missing from production for a while and the PGRST205 that came back
    // on every request was swallowed, so the admin toggles looked like they
    // simply refused to save.
    if (error) {
      console.error(
        "[site-layout] could not read public_site_layout; every setting is falling back to its registry default",
        error,
      );
    }

    return resolveLayout(data ?? []);
  },
);

/**
 * The same settings for the tenant the signed-in user has selected, for the
 * admin panel. Read straight from `app_settings` -- RLS scopes it to the
 * current tenant -- rather than through `public_site_layout`, which answers for
 * the request host and so would show a portal admin whichever tenant owns
 * `portal.<domain>` rather than the one they are editing.
 */
export const getTenantLayoutValues = cache(
  async (supabase: SupabaseClient): Promise<Record<string, number>> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "layout.%");

    if (error) {
      console.error(
        "[site-layout] could not read layout.* from app_settings; the panel is showing registry defaults",
        error,
      );
    }

    return resolveLayoutValues(
      (data ?? []).map((row) => ({
        slot: String(row.key).slice("layout.".length),
        value: row.value,
      })),
    );
  },
);
