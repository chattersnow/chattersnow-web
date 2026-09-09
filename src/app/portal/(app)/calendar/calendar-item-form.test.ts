import { describe, expect, test } from "bun:test";
import { parseCalendarItemForm } from "./calendar-item-form";

/**
 * The six categories a fresh database seeds. Passed in explicitly because the
 * vocabulary is per-tenant since #834 -- there is no constant to import, and
 * spelling it out here is what makes these cases readable.
 */
const CATEGORY_KEYS = [
  "lgbtq_community",
  "winter_outdoor_sports",
  "community_social_justice",
  "own_events",
  "campaigns_fundraising",
  "partner_opportunities",
];

function formData(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

const validFields = {
  title: "Transgender Day of Visibility",
  itemType: "heritage_social_justice_moment",
  startsAt: "2027-03-31T09:00",
  timeZone: "America/Denver",
  priorityTier: "1",
  calendarStatus: "idea",
  visibility: "internal",
};

describe("parseCalendarItemForm", () => {
  test("parses valid input", () => {
    const result = parseCalendarItemForm(formData(validFields), CATEGORY_KEYS);
    expect("data" in result && result.data.title).toBe(
      "Transgender Day of Visibility",
    );
    expect("data" in result && result.data.priorityTier).toBe(1);
    expect("data" in result && result.data.decision).toBeNull();
  });

  test("requires a title", () => {
    expect(
      parseCalendarItemForm(
        formData({ ...validFields, title: "" }),
        CATEGORY_KEYS,
      ),
    ).toEqual({
      error: "Title is required.",
    });
  });

  test("requires a valid item type", () => {
    expect(
      parseCalendarItemForm(
        formData({ ...validFields, itemType: "made_up" }),
        CATEGORY_KEYS,
      ),
    ).toEqual({
      error: "Select a valid item type.",
    });
  });

  test("requires end date to be after start date", () => {
    const result = parseCalendarItemForm(
      formData({ ...validFields, endsAt: "2027-03-30T09:00" }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({ error: "End date must be after the start date." });
  });

  test("requires an owner once status moves past idea", () => {
    const result = parseCalendarItemForm(
      formData({ ...validFields, calendarStatus: "active" }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({
      error:
        "An owner is required once a calendar item moves past idea status.",
    });
  });

  test("allows an idea with no owner", () => {
    const result = parseCalendarItemForm(formData(validFields), CATEGORY_KEYS);
    expect("data" in result && result.data.ownerId).toBeNull();
  });

  test("accepts an owner for active status", () => {
    const result = parseCalendarItemForm(
      formData({
        ...validFields,
        calendarStatus: "active",
        ownerId: "11111111-1111-1111-1111-111111111111",
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.calendarStatus).toBe("active");
  });

  test("requires a reason when an item is skipped", () => {
    const result = parseCalendarItemForm(
      formData({ ...validFields, decision: "skip" }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({
      error: "A reason is required when an item is skipped.",
    });
  });

  test("accepts a skip decision with a note", () => {
    const result = parseCalendarItemForm(
      formData({
        ...validFields,
        decision: "skip",
        decisionNote: "Handled offline this year.",
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.decision).toBe("skip");
  });

  test("parses multiple categories and programs", () => {
    const result = parseCalendarItemForm(
      formData({
        ...validFields,
        categories: ["lgbtq_community", "community_social_justice"],
        programIds: ["11111111-1111-1111-1111-111111111111"],
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.categories).toEqual([
      "lgbtq_community",
      "community_social_justice",
    ]);
  });

  test("rejects an invalid category", () => {
    const result = parseCalendarItemForm(
      formData({ ...validFields, categories: ["not_real"] }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({ error: "Select valid categories." });
  });

  test("defaults sensitive-topic fields to unflagged with no guidance", () => {
    const result = parseCalendarItemForm(formData(validFields), CATEGORY_KEYS);
    expect("data" in result && result.data.isSensitiveTopic).toBe(false);
    expect("data" in result && result.data.toneGuidance).toBeNull();
  });

  test("parses a sensitive-topic flag with tone guidance", () => {
    const result = parseCalendarItemForm(
      formData({
        ...validFields,
        isSensitiveTopic: "true",
        toneGuidance: "  Memorial, not sensational.  ",
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.isSensitiveTopic).toBe(true);
    expect("data" in result && result.data.toneGuidance).toBe(
      "Memorial, not sensational.",
    );
  });
});
