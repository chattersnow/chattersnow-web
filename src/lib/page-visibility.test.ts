import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_PAGE_SLOTS,
  getPageVisibility,
  hiddenSlots,
  pageVisibilitySettingKey,
} from "./page-visibility";

type Row = { slot: string; value: unknown };

function clientReturning(data: Row[] | null): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data, error: null }) }),
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
    const visibility = await getPageVisibility(clientReturning(null));

    expect(visibility.programs).toBe(false);
    expect(visibility.contact).toBe(true);
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

    expect(hiddenSlots(visibility).sort()).toEqual(["programs", "support"]);
  });
});
