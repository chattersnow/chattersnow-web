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
  /**
   * The file under `src/app/(public)` that calls `requireVisiblePage()` for
   * this slot. Defaults to `<key>/layout.tsx`, which is where a section-wide
   * slot belongs. A slot covering a single route names that route's page
   * instead, and page-visibility.test.ts checks whichever file this resolves
   * to -- registering a slot without gating it hides the nav link and leaves
   * the URL live.
   */
  gate?: string;
};

/**
 * Registry of every public site section the board can show or hide from
 * Administration > System Settings. Adding an entry here is enough to wire a
 * section up in the admin UI and in the gate -- no migration needed, since
 * every slot is just a keyed row in app_settings (same approach as
 * BRAND_COLOR_TOKENS in src/lib/branding.ts).
 *
 * A slot normally covers a whole section, not a single route: the gate goes in
 * the section's layout, so every page beneath it is hidden together. `gate`
 * is the exception, for a single page whose *content* rather than its shape is
 * what needs gating.
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
      "The Support page, plus the Donations and Sponsorship pages beneath it.",
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
    description: "The gear library and the gear donation pages.",
    defaultVisible: true,
  },
  // The one slot that gates a single route rather than a section, and the
  // reason is the content rather than the shape: the sizing charts are
  // snow-sports specific (ski lengths, mondopoint, DIN settings), authored by
  // Chatter Snow, and not editable from the portal. Gear as a whole is chrome
  // any organization can use, so it stays on by default; these charts are one
  // organization's guide and would otherwise publish under every tenant's
  // brand the moment they were provisioned (#795 Phase 3).
  {
    key: "gears-sizing",
    label: "Sizing Guide",
    description:
      "The ski and snowboard sizing charts under Gear. Written for snow sports specifically, so it stays hidden until an organization says the guide is theirs.",
    defaultVisible: false,
    gate: "gears/sizing/page.tsx",
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
    const { data, error } = await supabase
      .from("public_page_visibility")
      .select("slot, value");

    // A failed read and "nothing configured yet" both land on the registry
    // defaults below. Falling back is the right call -- an unreadable flag must
    // not publish an unapproved section -- but it must not be silent: this view
    // was missing from production for a while, and the PGRST205 that came back
    // on every request was swallowed here, so the admin toggles looked like
    // they simply refused to save. A broken read has to say so out loud.
    if (error) {
      console.error(
        "[page-visibility] could not read public_page_visibility; every section is falling back to its registry default",
        error,
      );
    }

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
