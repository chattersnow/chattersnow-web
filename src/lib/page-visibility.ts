import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicPageSlot = {
  key: string;
  label: string;
  description: string;
  /**
   * Applied when no `page_visibility.<key>` row exists in app_settings.
   * Production is seeded with no rows at all, so this is what actually
   * decides whether a section is live on a fresh deploy. New sections should
   * be added `false`, so "not shown until the board approves it" is the
   * default a contributor has to opt out of rather than remember to opt in to.
   */
  defaultVisible: boolean;
};

/**
 * Registry of every public site section the board can show or hide from
 * Administration > System Settings. Adding an entry here is enough to wire a
 * section up in the admin UI and in the gate -- no migration needed, since
 * every slot is just a keyed row in app_settings (same approach as
 * SITE_IMAGE_SLOTS in src/lib/site-images.ts).
 *
 * A slot covers a whole section, not a single route: the gate goes in the
 * section's layout, so every page beneath it is hidden together.
 */
export const PUBLIC_PAGE_SLOTS: PublicPageSlot[] = [
  {
    key: "programs",
    label: "Programs",
    description:
      "The Programs page describing Access, Community, and Progression.",
    defaultVisible: false,
  },
  {
    key: "learn",
    label: "Learn",
    description:
      "The Learn section and all of its guides (etiquette, gear and sizing, budget, and the rest).",
    defaultVisible: false,
  },
  {
    key: "support",
    label: "Support",
    description:
      "Support Chatter, plus the Donations and Sponsorship pages beneath it.",
    defaultVisible: false,
  },
  {
    key: "about",
    label: "About",
    description: "Our Story, Mission & Values, and Meet the Team.",
    defaultVisible: true,
  },
  {
    key: "events",
    label: "Events",
    description:
      "The events listing, event detail pages, and the community calendar.",
    defaultVisible: true,
  },
  {
    key: "gears",
    label: "Gear",
    description: "The gear library, sizing guide, and gear donation pages.",
    defaultVisible: true,
  },
  {
    key: "get-involved",
    label: "Get Involved",
    description: "Attend, Volunteer, and Become a Partner.",
    defaultVisible: true,
  },
  {
    key: "contact",
    label: "Contact",
    description: "The contact page and its message form.",
    defaultVisible: true,
  },
];

export function pageVisibilitySettingKey(slot: string): string {
  return `page_visibility.${slot}`;
}

/**
 * Resolves a stored app_settings value to a boolean. Anything that isn't an
 * explicit boolean (a missing row, a null, a value someone typed by hand into
 * the table) falls back to the slot's registry default rather than guessing --
 * an unreadable flag must not accidentally publish an unapproved section.
 */
function resolveVisibility(value: unknown, defaultVisible: boolean): boolean {
  return typeof value === "boolean" ? value : defaultVisible;
}

/**
 * Reads the visibility of every registered section. Wrapped in React `cache()`
 * so the public layout (which filters the nav and footer) and the section
 * layout (which gates the route) share a single query per render.
 */
export const getPageVisibility = cache(
  async (supabase: SupabaseClient): Promise<Record<string, boolean>> => {
    const { data } = await supabase
      .from("public_page_visibility")
      .select("slot, value");

    const visibility: Record<string, boolean> = {};
    for (const slot of PUBLIC_PAGE_SLOTS) {
      const row = data?.find((setting) => setting.slot === slot.key);
      visibility[slot.key] = resolveVisibility(row?.value, slot.defaultVisible);
    }
    return visibility;
  },
);

/** The slots that are currently hidden, for filtering nav and footer links. */
export function hiddenSlots(visibility: Record<string, boolean>): string[] {
  return PUBLIC_PAGE_SLOTS.filter((slot) => !visibility[slot.key]).map(
    (slot) => slot.key,
  );
}

/**
 * Whether a section is currently live. Use it to hide a call-to-action that
 * links into another section -- the nav and footer are filtered centrally, but
 * an in-page CTA (the homepage's Donate button, say) would otherwise point at
 * a page the board has hidden and 404.
 */
export async function isPageVisible(slot: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const visibility = await getPageVisibility(supabase);
  return Boolean(visibility[slot]);
}

/**
 * Route gate. Call at the top of a section's layout: hiding a section from the
 * nav doesn't make its URLs unreachable, so the section itself has to 404.
 */
export async function requireVisiblePage(slot: string): Promise<void> {
  if (!(await isPageVisible(slot))) {
    notFound();
  }
}
