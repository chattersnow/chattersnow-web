import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_PAGE_SLOTS,
  getPageVisibility,
  getTenantPageVisibility,
  hiddenSlots,
  pageVisibilitySettingKey,
} from "./page-visibility";

type Row = { slot: string; value: unknown };

function clientReturning(data: Row[] | null): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data, error: null }) }),
  } as unknown as SupabaseClient;
}

/**
 * The shape PostgREST actually returns when the view is missing -- which is how
 * this failed in production, where the migration creating
 * `public_page_visibility` had never been pushed.
 */
function clientFailing(): SupabaseClient {
  return {
    from: () => ({
      select: async () => ({
        data: null,
        error: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.public_page_visibility' in the schema cache",
          details: null,
          hint: "Perhaps you meant the table 'public.public_site_images'",
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("pageVisibilitySettingKey", () => {
  test("namespaces the slot under the page_visibility prefix", () => {
    expect(pageVisibilitySettingKey("programs")).toBe(
      "page_visibility.programs",
    );
  });
});

describe("PUBLIC_PAGE_SLOTS", () => {
  test("has no duplicate keys", () => {
    const keys = PUBLIC_PAGE_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Production is deployed with no page_visibility rows at all, so these
  // defaults are what actually keeps the unapproved sections dark.
  test("keeps the sections awaiting board approval hidden by default", () => {
    for (const key of ["programs", "learn", "support"]) {
      const slot = PUBLIC_PAGE_SLOTS.find((entry) => entry.key === key);
      expect(slot?.defaultVisible).toBe(false);
    }
  });

  // Registering a slot only filters it out of the nav and footer. Without a
  // gate in the section's own layout its URLs stay live and indexable, so the
  // board hides the link and believes it has hidden the section -- which is
  // exactly what had happened to about/events/gears/get-involved/contact:
  // five of the eight slots were registered but never gated.
  test("every registered slot has a route gate in its section layout", () => {
    const publicDir = join(import.meta.dirname, "..", "app", "(public)");

    for (const slot of PUBLIC_PAGE_SLOTS) {
      const gate = slot.gate ?? join(slot.key, "layout.tsx");
      let source: string;
      try {
        source = readFileSync(join(publicDir, gate), "utf8");
      } catch {
        throw new Error(
          `${slot.key} is registered in PUBLIC_PAGE_SLOTS but has no ${gate} to gate it.`,
        );
      }

      expect(
        source.includes(`requireVisiblePage("${slot.key}")`),
        `${gate} must call requireVisiblePage("${slot.key}")`,
      ).toBe(true);
    }
  });

  // The sizing guide is not awaiting board approval -- it is one tenant's
  // snow-sports content sitting under a section every tenant gets. Provisioning
  // copies no site content, so this default is the only thing standing between
  // a new customer and a ski-length chart on their own domain (#795 Phase 3).
  test("keeps the sizing guide hidden until a tenant claims it", () => {
    const slot = PUBLIC_PAGE_SLOTS.find(
      (entry) => entry.key === "gears-sizing",
    );

    expect(slot?.defaultVisible).toBe(false);
    // Its parent stays on: a gear library is chrome, the charts are content.
    expect(
      PUBLIC_PAGE_SLOTS.find((entry) => entry.key === "gears")?.defaultVisible,
    ).toBe(true);
  });
});

describe("getPageVisibility", () => {
  test("falls back to the registry default when a slot has no row", async () => {
    const visibility = await getPageVisibility(clientReturning([]));

    for (const slot of PUBLIC_PAGE_SLOTS) {
      expect(visibility[slot.key]).toBe(slot.defaultVisible);
    }
  });

  test("a stored value overrides the registry default in both directions", async () => {
    const visibility = await getPageVisibility(
      clientReturning([
        { slot: "programs", value: true },
        { slot: "contact", value: false },
      ]),
    );

    expect(visibility.programs).toBe(true);
    expect(visibility.contact).toBe(false);
  });

  // A null, a string, or a hand-edited row must not be read as "publish it".
  test("treats a non-boolean value as unset rather than as visible", async () => {
    const visibility = await getPageVisibility(
      clientReturning([
        { slot: "programs", value: null },
        { slot: "learn", value: "true" },
      ]),
    );

    expect(visibility.programs).toBe(false);
    expect(visibility.learn).toBe(false);
  });

  test("a failed query leaves every slot on its default", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const visibility = await getPageVisibility(clientFailing());

      expect(visibility.programs).toBe(false);
      expect(visibility.contact).toBe(true);
    } finally {
      error.mockRestore();
    }
  });

  // The fallback above is safe but indistinguishable from "not configured yet",
  // so the failure itself has to reach the server logs -- otherwise a broken
  // read shows up only as admin toggles that appear not to save.
  test("logs the failure rather than falling back silently", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      await getPageVisibility(clientFailing());

      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]?.[1]).toMatchObject({ code: "PGRST205" });
    } finally {
      error.mockRestore();
    }
  });

  test("ignores rows for slots that aren't in the registry", async () => {
    const visibility = await getPageVisibility(
      clientReturning([{ slot: "not-a-section", value: true }]),
    );

    expect(visibility["not-a-section"]).toBeUndefined();
  });
});

describe("hiddenSlots", () => {
  test("lists only the slots that are switched off", async () => {
    const visibility = await getPageVisibility(
      clientReturning([{ slot: "learn", value: true }]),
    );

    expect(hiddenSlots(visibility).sort()).toEqual([
      "brand",
      "gears-sizing",
      "programs",
      "support",
    ]);
  });
});

describe("getTenantPageVisibility", () => {
  /**
   * `app_settings` as the panel reads it: whole keys, filtered with `.like()`,
   * scoped to the signed-in admin's tenant by RLS rather than to the request
   * host by the view.
   */
  function settingsClientReturning(
    data: { key: string; value: unknown }[] | null,
  ): SupabaseClient {
    return {
      from: () => ({
        select: () => ({ like: async () => ({ data, error: null }) }),
      }),
    } as unknown as SupabaseClient;
  }

  test("reads the admin's own tenant rows, and falls back to the registry default", async () => {
    const slot = PUBLIC_PAGE_SLOTS[0];
    const visibility = await getTenantPageVisibility(
      settingsClientReturning([
        {
          key: pageVisibilitySettingKey(slot.key),
          value: !slot.defaultVisible,
        },
      ]),
    );

    expect(visibility[slot.key]).toBe(!slot.defaultVisible);
    for (const other of PUBLIC_PAGE_SLOTS.slice(1)) {
      expect(visibility[other.key]).toBe(other.defaultVisible);
    }
  });
});
