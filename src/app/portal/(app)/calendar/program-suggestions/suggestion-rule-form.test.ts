import { describe, expect, test } from "bun:test";
import { parseSuggestionRuleForm } from "./suggestion-rule-form";

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

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const PROGRAM_ID = "11111111-1111-1111-1111-111111111111";

describe("parseSuggestionRuleForm", () => {
  test("parses a category-only rule", () => {
    const result = parseSuggestionRuleForm(
      formData({ category: "lgbtq_community", programId: PROGRAM_ID }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.category).toBe("lgbtq_community");
    expect("data" in result && result.data.itemType).toBeNull();
  });

  test("parses an item-type-only rule", () => {
    const result = parseSuggestionRuleForm(
      formData({ itemType: "partner_event", programId: PROGRAM_ID }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.itemType).toBe("partner_event");
    expect("data" in result && result.data.category).toBeNull();
  });

  test("treats 'any' as unset for both dimensions", () => {
    const result = parseSuggestionRuleForm(
      formData({
        itemType: "any",
        category: "lgbtq_community",
        programId: PROGRAM_ID,
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.itemType).toBeNull();
  });

  test("requires at least one of item type or category", () => {
    const result = parseSuggestionRuleForm(
      formData({ programId: PROGRAM_ID }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({
      error:
        "Select an item type, a category, or both — a rule can't match every item.",
    });
  });

  test("requires a program", () => {
    const result = parseSuggestionRuleForm(
      formData({ category: "lgbtq_community" }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({ error: "Select a program to suggest." });
  });

  test("rejects an invalid item type", () => {
    const result = parseSuggestionRuleForm(
      formData({ itemType: "made_up", programId: PROGRAM_ID }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({ error: "Select a valid item type." });
  });

  test("rejects an invalid category", () => {
    const result = parseSuggestionRuleForm(
      formData({ category: "made_up", programId: PROGRAM_ID }),
      CATEGORY_KEYS,
    );
    expect(result).toEqual({ error: "Select a valid category." });
  });

  test("trims a blank note to null and defaults active to true", () => {
    const result = parseSuggestionRuleForm(
      formData({
        category: "lgbtq_community",
        programId: PROGRAM_ID,
        note: "  ",
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.note).toBeNull();
    expect("data" in result && result.data.isActive).toBe(true);
  });

  test("parses an explicit inactive flag and a note", () => {
    const result = parseSuggestionRuleForm(
      formData({
        category: "lgbtq_community",
        programId: PROGRAM_ID,
        note: "From the planning doc's trans-observance example.",
        isActive: "false",
      }),
      CATEGORY_KEYS,
    );
    expect("data" in result && result.data.isActive).toBe(false);
    expect("data" in result && result.data.note).toBe(
      "From the planning doc's trans-observance example.",
    );
  });
});
