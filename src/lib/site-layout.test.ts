import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SITE_LAYOUT,
  HOME_UPCOMING_CARDS_SLOT,
  HOME_UPCOMING_COMMUNITY_SLOT,
  HOME_UPCOMING_COUNT_SLOT,
  LAYOUT_SLOTS,
  MAX_HOME_UPCOMING_COUNT,
  PROGRAMS_SOURCE_SLOT,
  isLayoutValue,
  layoutSettingKey,
  resolveLayout,
  resolveLayoutValues,
  type SiteLayout,
} from "./site-layout";

const DEFAULTS: SiteLayout = {
  homeUpcomingCount: 3,
  homeUpcomingCards: "fliers",
  homeUpcomingCommunity: true,
  programsSource: "content",
};

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
  test("uses stored values the slots offer, across all three value types", () => {
    expect(
      resolveLayout([
        { slot: HOME_UPCOMING_COUNT_SLOT, value: 6 },
        { slot: HOME_UPCOMING_CARDS_SLOT, value: "compact" },
        { slot: HOME_UPCOMING_COMMUNITY_SLOT, value: false },
        { slot: PROGRAMS_SOURCE_SLOT, value: "module" },
      ]),
    ).toEqual({
      homeUpcomingCount: 6,
      homeUpcomingCards: "compact",
      homeUpcomingCommunity: false,
      programsSource: "module",
    });
  });

  test("falls back to the registry defaults when nothing is stored", () => {
    expect(resolveLayout([])).toEqual(DEFAULTS);
    expect(DEFAULT_SITE_LAYOUT).toEqual(DEFAULTS);
  });

  // The Programs page was copy-driven before #898 and every tenant that has
  // said nothing must keep it that way: a deploy that quietly repointed the
  // page at a module holding no public programs would blank a live section.
  test("leaves the Programs page on Site Content until a tenant says otherwise", () => {
    expect(resolveLayout([]).programsSource).toBe("content");
    expect(
      resolveLayout([{ slot: PROGRAMS_SOURCE_SLOT, value: "modules" }])
        .programsSource,
    ).toBe("content");
    expect(
      resolveLayout([{ slot: PROGRAMS_SOURCE_SLOT, value: "module" }])
        .programsSource,
    ).toBe("module");
  });

  test("resolves each slot independently", () => {
    expect(
      resolveLayout([{ slot: HOME_UPCOMING_CARDS_SLOT, value: "compact" }]),
    ).toEqual({ ...DEFAULTS, homeUpcomingCards: "compact" });
  });

  // A row someone typed straight into the table, a value retired from the
  // options since it was saved, or a null must not reach a page as a layout
  // nobody designed.
  test.each([
    ["a value nobody offers", 4],
    ["a number as a string", "3"],
    ["null", null],
    ["a boolean where a number belongs", true],
    ["an object", { count: 3 }],
  ])("ignores %s and uses the default", (_label, value) => {
    expect(resolveLayout([{ slot: HOME_UPCOMING_COUNT_SLOT, value }])).toEqual(
      DEFAULTS,
    );
  });

  // `false` is a legitimate stored value, so the resolver must not treat it
  // the way it treats a missing row.
  test("keeps a stored false rather than falling back to the default of true", () => {
    expect(
      resolveLayout([{ slot: HOME_UPCOMING_COMMUNITY_SLOT, value: false }])
        .homeUpcomingCommunity,
    ).toBe(false);
  });

  test('ignores "false" as a string, which is not an offered value', () => {
    expect(
      resolveLayout([{ slot: HOME_UPCOMING_COMMUNITY_SLOT, value: "false" }])
        .homeUpcomingCommunity,
    ).toBe(true);
  });

  test("ignores rows for slots that aren't registered", () => {
    expect(
      resolveLayout([
        { slot: "home_upcoming_somethingelse", value: 6 },
        { slot: HOME_UPCOMING_COUNT_SLOT, value: 1 },
      ]),
    ).toEqual({ ...DEFAULTS, homeUpcomingCount: 1 });
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

  // The panel serialises option values with String() to drive a Select, so two
  // options that stringify the same would be indistinguishable coming back.
  test("no slot's options collide when stringified", () => {
    for (const slot of LAYOUT_SLOTS) {
      const rendered = slot.options.map((option) => String(option.value));
      expect(new Set(rendered).size).toBe(slot.options.length);
    }
  });

  // A switch reads options[0] as "on" and options[1] as "off".
  test("every switch slot has exactly two options", () => {
    for (const slot of LAYOUT_SLOTS.filter((s) => s.control === "switch")) {
      expect(slot.options).toHaveLength(2);
    }
  });

  // The home page queries this many rows and slices down, so a new option
  // above the maximum would be silently unreachable.
  test("MAX_HOME_UPCOMING_COUNT covers the largest option on offer", () => {
    const largest = Math.max(
      ...countSlot.options.map((option) => Number(option.value)),
    );
    expect(MAX_HOME_UPCOMING_COUNT).toBe(largest);
  });
});
