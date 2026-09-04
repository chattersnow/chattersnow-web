import { describe, expect, test } from "bun:test";
import { EVENT_TYPES, eventTypeLabel } from "./event-types";

describe("eventTypeLabel", () => {
  test("renders a curated type by its label", () => {
    expect(eventTypeLabel("gear_swap")).toBe("Gear swap");
    expect(eventTypeLabel("community_meetup")).toBe("Community meetup");
  });

  test("humanises a slug outside the list rather than dropping it", () => {
    // events.event_type has no check constraint, so a value can reach the UI
    // from a seed, a fixture or a future list entry we don't know about.
    expect(eventTypeLabel("corporate_day")).toBe("Corporate day");
  });

  test("passes legacy free text through", () => {
    // The create dialog took free text before this list existed.
    expect(eventTypeLabel("Access Day")).toBe("Access Day");
  });

  test("returns null for an absent type so callers keep their own fallback", () => {
    expect(eventTypeLabel(null)).toBeNull();
    expect(eventTypeLabel(undefined)).toBeNull();
    expect(eventTypeLabel("")).toBeNull();
    expect(eventTypeLabel("   ")).toBeNull();
  });

  test("covers every type the seed writes", () => {
    const values: string[] = EVENT_TYPES.map((type) => type.value);
    for (const seeded of [
      "gear_swap",
      "trail_cleanup",
      "fundraiser",
      "community_meetup",
      "skills_clinic",
      "holiday_drive",
    ]) {
      expect(values).toContain(seeded);
    }
  });
});
