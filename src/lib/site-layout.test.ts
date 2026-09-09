import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SITE_LAYOUT,
  HOME_UPCOMING_COUNT_SLOT,
  LAYOUT_SLOTS,
  MAX_HOME_UPCOMING_COUNT,
  isLayoutValue,
  layoutSettingKey,
  resolveLayout,
  resolveLayoutValues,
} from "./site-layout";

const countSlot = LAYOUT_SLOTS.find(
  (slot) => slot.key === HOME_UPCOMING_COUNT_SLOT,
)!;

describe("layoutSettingKey", () => {
  test("prefixes the slot, matching the view's substring", () => {
    expect(layoutSettingKey(HOME_UPCOMING_COUNT_SLOT)).toBe(
      "layout.home_upcoming_count",
    );
  });
});

describe("resolveLayout", () => {
  test("uses a stored value the slot offers", () => {
    expect(
      resolveLayout([{ slot: HOME_UPCOMING_COUNT_SLOT, value: 6 }]),
    ).toEqual({ homeUpcomingCount: 6 });
  });

  test("falls back to the registry default when nothing is stored", () => {
    expect(resolveLayout([])).toEqual({ homeUpcomingCount: 3 });
    expect(DEFAULT_SITE_LAYOUT).toEqual({ homeUpcomingCount: 3 });
  });

  // A row someone typed straight into the table, a value retired from the
  // options since it was saved, or a null must not reach a page as a layout
  // nobody designed.
  test.each([
    ["a value nobody offers", 4],
    ["a number as a string", "3"],
    ["null", null],
    ["a boolean", true],
    ["an object", { count: 3 }],
  ])("ignores %s and uses the default", (_label, value) => {
    expect(resolveLayout([{ slot: HOME_UPCOMING_COUNT_SLOT, value }])).toEqual({
      homeUpcomingCount: 3,
    });
  });

  test("ignores rows for slots that aren't registered", () => {
    expect(
      resolveLayout([
        { slot: "home_upcoming_somethingelse", value: 6 },
        { slot: HOME_UPCOMING_COUNT_SLOT, value: 1 },
      ]),
    ).toEqual({ homeUpcomingCount: 1 });
  });
});

describe("resolveLayoutValues", () => {
  test("populates every registered slot, so the panel never renders a blank", () => {
    const values = resolveLayoutValues([]);
    for (const slot of LAYOUT_SLOTS) {
      expect(values[slot.key]).toBe(slot.defaultValue);
    }
  });
});

describe("the registry itself", () => {
  test("every slot's default is one of the values it offers", () => {
    for (const slot of LAYOUT_SLOTS) {
      expect(isLayoutValue(slot, slot.defaultValue)).toBe(true);
    }
  });

  // The home page queries this many rows and slices down, so a new option
  // above the maximum would be silently unreachable.
  test("MAX_HOME_UPCOMING_COUNT covers the largest option on offer", () => {
    const largest = Math.max(
      ...countSlot.options.map((option) => option.value),
    );
    expect(MAX_HOME_UPCOMING_COUNT).toBe(largest);
  });
});
