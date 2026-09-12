import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_PAGE_SLOTS,
  getPageVisibility,
  getTenantPageVisibility,
  hiddenSlots,
  moduleBlockedSlots,
  pageVisibilitySettingKey,
} from "./page-visibility";

type Row = { slot: string; value: unknown };
type ModuleRow = { module_key: string; enabled: boolean };

/**
 * Since #902 `getPageVisibility` reads two tables, so the fake dispatches on the
 * name rather than answering everything with the same rows. `modules` defaults
 * to the whole catalog being on, which is every tenant until an operator says
 * otherwise -- so a test that says nothing about modules gets the pre-#902
 * behaviour.
 */
function clientReturning(
  data: Row[] | null,
  modules: ModuleRow[] = [],
): SupabaseClient {
  return {
    from: (table: string) => ({
      select: async () => ({
        data: table === "public_tenant_modules" ? modules : data,
        error: null,
      }),
    }),
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
    // Resolved from `src/app`, not from `(public)`: a gated route need not be
    // inside that route group. `/links` is not, because the group's layout is
    // the site header and footer it deliberately does without (#937).
    const appDir = join(import.meta.dirname, "..", "app");

    for (const slot of PUBLIC_PAGE_SLOTS) {
      const gate = slot.gate ?? join("(public)", slot.key, "layout.tsx");
      let source: string;
      try {
        source = readFileSync(join(appDir, gate), "utf8");
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

      // Twice since #902: the visibility read and the module read are separate
      // queries against the same broken client, and each has to say so.
      expect(error).toHaveBeenCalledTimes(2);
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

// #902. The entitlement is the platform's and the visibility flag is the
// board's, and when they disagree the entitlement wins -- so these assert the
// override in both directions, and that nothing changes for a tenant that has
// every module, which is every tenant today.
describe("module gating", () => {
  const MODULE_KEYS = [
    "events",
    "artwork",
    "calendar",
    "programs",
    "inventory",
    "volunteers",
    "communications",
    "finance",
    "reimbursements",
    "people",
    "governance",
    "access_management",
    "administration",
  ];

  test("every slot's module, where it has one, is a real module", () => {
    // The registry is TypeScript and the catalog is SQL, so nothing but this
    // stops a typo mapping a section to a module that will never be off.
    for (const slot of PUBLIC_PAGE_SLOTS) {
      if (slot.module === undefined) continue;
      expect(MODULE_KEYS, `${slot.key} -> ${slot.module}`).toContain(
        slot.module,
      );
    }
  });

  test("a slot with its module off is hidden whatever the board stored", async () => {
    const visibility = await getPageVisibility(
      clientReturning(
        [
          { slot: "events", value: true },
          { slot: "gears", value: true },
          { slot: "contact", value: true },
        ],
        [{ module_key: "inventory", enabled: false }],
      ),
    );

    expect(visibility.gears).toBe(false);
    // Both slots the Inventory module owns, including the single-route one.
    expect(visibility["gears-sizing"]).toBe(false);
    // And nothing else moves.
    expect(visibility.events).toBe(true);
    expect(visibility.contact).toBe(true);
  });

  test("a slot whose module is on behaves exactly as before", async () => {
    const withModules = await getPageVisibility(
      clientReturning(
        [{ slot: "programs", value: true }],
        MODULE_KEYS.map((key) => ({ module_key: key, enabled: true })),
      ),
    );
    const withoutModules = await getPageVisibility(
      clientReturning([{ slot: "programs", value: true }]),
    );

    expect(withModules).toEqual(withoutModules);
    expect(withModules.programs).toBe(true);
  });

  test("an off module cannot publish a section the board has hidden", async () => {
    // The override is one-way. `support` defaults to hidden, so Finance being
    // *on* must not turn it on.
    const visibility = await getPageVisibility(
      clientReturning([], [{ module_key: "finance", enabled: true }]),
    );
    expect(visibility.support).toBe(false);
  });

  test("an unmapped slot ignores modules entirely", async () => {
    // About, Learn and Brand are the organization's own pages; no entitlement
    // reaches them.
    const visibility = await getPageVisibility(
      clientReturning(
        [
          { slot: "about", value: true },
          { slot: "learn", value: true },
        ],
        MODULE_KEYS.map((key) => ({ module_key: key, enabled: false })),
      ),
    );
    expect(visibility.about).toBe(true);
    expect(visibility.learn).toBe(true);
  });

  test("Get Involved survives Volunteers being off; the volunteer page does not", async () => {
    // The decision #902 left for review. Attend is about events and the partner
    // page funnels to /contact, so only the volunteer routes go.
    const visibility = await getPageVisibility(
      clientReturning([], [{ module_key: "volunteers", enabled: false }]),
    );

    expect(visibility["get-involved"]).toBe(true);
    expect(visibility["get-involved-volunteer"]).toBe(false);
  });

  test("an unreadable module answer leaves every section as the board set it", async () => {
    // Fail open, the opposite of the visibility read directly above -- a
    // missing module row means "this tenant predates the table", not "nobody
    // has approved this".
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const visibility = await getPageVisibility({
        from: (table: string) => ({
          select: async () =>
            table === "public_tenant_modules"
              ? { data: null, error: { code: "PGRST205", message: "gone" } }
              : { data: [{ slot: "gears", value: true }], error: null },
        }),
      } as unknown as SupabaseClient);

      expect(visibility.gears).toBe(true);
    } finally {
      error.mockRestore();
    }
  });

  describe("moduleBlockedSlots", () => {
    test("names the module withholding each slot, for the panel to explain", () => {
      expect(moduleBlockedSlots({ inventory: false, finance: false })).toEqual({
        gears: "inventory",
        "gears-sizing": "inventory",
        support: "finance",
      });
    });

    test("is empty for a tenant with everything", () => {
      expect(moduleBlockedSlots({ inventory: true })).toEqual({});
      expect(moduleBlockedSlots({})).toEqual({});
    });
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
      "links",
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
