import { describe, expect, test } from "bun:test";
import {
  parseCalendarCategoryForm,
  slugifyCalendarCategoryKey,
} from "./category-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("slugifyCalendarCategoryKey", () => {
  test("lowercases and underscores a label", () => {
    expect(slugifyCalendarCategoryKey("Our events")).toBe("our_events");
    expect(slugifyCalendarCategoryKey("Campaigns & fundraising")).toBe(
      "campaigns_fundraising",
    );
  });

  test("collapses runs and trims the edges", () => {
    expect(slugifyCalendarCategoryKey("  LGBTQ+  community  ")).toBe(
      "lgbtq_community",
    );
  });

  // The key has to satisfy `key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`, so a label with
  // nothing sluggable in it must be refused by the parser rather than reaching
  // the database and failing on a constraint nobody can read.
  test("returns empty for a label with nothing sluggable in it", () => {
    expect(slugifyCalendarCategoryKey("!!!")).toBe("");
    expect(slugifyCalendarCategoryKey("日本語")).toBe("");
  });
});

describe("parseCalendarCategoryForm", () => {
  test("parses a valid category", () => {
    const result = parseCalendarCategoryForm(
      formData({ label: "Our events", sortOrder: "40" }),
    );
    expect(result).toEqual({
      data: { label: "Our events", sort_order: 40, is_active: true },
    });
  });

  test("requires a name", () => {
    expect(parseCalendarCategoryForm(formData({ label: "   " }))).toEqual({
      error: "Category name is required.",
    });
  });

  test("rejects a name that slugifies to nothing", () => {
    expect(parseCalendarCategoryForm(formData({ label: "!!!" }))).toEqual({
      error: "Category name must include a letter or number.",
    });
  });

  test("defaults sort order to zero when it is left blank", () => {
    const result = parseCalendarCategoryForm(formData({ label: "Partners" }));
    expect("data" in result && result.data.sort_order).toBe(0);
  });

  test("rejects a negative or non-numeric sort order", () => {
    for (const sortOrder of ["-1", "abc"]) {
      expect(
        parseCalendarCategoryForm(formData({ label: "Partners", sortOrder })),
      ).toEqual({ error: "Sort order must be a positive number." });
    }
  });

  // The checkbox posts nothing when unchecked, so "absent" has to mean active
  // for a create and the explicit "off" has to mean retired for an edit.
  test("treats a missing checkbox as active and an explicit off as retired", () => {
    const created = parseCalendarCategoryForm(formData({ label: "Partners" }));
    expect("data" in created && created.data.is_active).toBe(true);

    const retired = parseCalendarCategoryForm(
      formData({ label: "Partners", isActive: "off" }),
    );
    expect("data" in retired && retired.data.is_active).toBe(false);
  });
});
