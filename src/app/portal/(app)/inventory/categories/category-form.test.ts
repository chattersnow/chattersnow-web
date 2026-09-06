import { describe, expect, test } from "bun:test";
import {
  parseCategoryForm,
  parseCategoryGroupForm,
  slugifyCategoryKey,
} from "./category-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("slugifyCategoryKey", () => {
  test("lowercases and joins words with underscores", () => {
    expect(slugifyCategoryKey("Ski Boots")).toBe("ski_boots");
  });

  test("collapses a run of punctuation into a single underscore", () => {
    expect(slugifyCategoryKey("Beanie / toque")).toBe("beanie_toque");
  });

  test("trims leading and trailing underscores", () => {
    expect(slugifyCategoryKey("  -- Helmets! --  ")).toBe("helmets");
  });

  test("drops non-ASCII characters", () => {
    expect(slugifyCategoryKey("Café gear")).toBe("caf_gear");
  });

  test("returns an empty key for a label with nothing sluggable", () => {
    expect(slugifyCategoryKey("!!!")).toBe("");
  });
});

describe("parseCategoryForm", () => {
  const validFields = {
    groupId: "group-1",
    label: "  Ski boots  ",
    sortOrder: "3",
    isActive: "on",
  };

  test("parses a fully filled form", () => {
    expect(parseCategoryForm(formData(validFields))).toEqual({
      data: {
        group_id: "group-1",
        label: "Ski boots",
        sort_order: 3,
        is_active: true,
      },
    });
  });

  test("requires a label", () => {
    expect(
      parseCategoryForm(formData({ ...validFields, label: "  " })),
    ).toEqual({ error: "Category name is required." });
  });

  test("requires a group", () => {
    expect(
      parseCategoryForm(formData({ ...validFields, groupId: "" })),
    ).toEqual({ error: "Select a category group." });
  });

  test("only 'off' turns the active toggle off", () => {
    const off = parseCategoryForm(
      formData({ ...validFields, isActive: "off" }),
    );
    expect("data" in off && off.data.is_active).toBe(false);

    const absent = formData(validFields);
    absent.delete("isActive");
    const parsedAbsent = parseCategoryForm(absent);
    expect("data" in parsedAbsent && parsedAbsent.data.is_active).toBe(true);
  });

  test("defaults an absent or blank sort order to zero", () => {
    const absent = formData(validFields);
    absent.delete("sortOrder");
    const parsedAbsent = parseCategoryForm(absent);
    expect("data" in parsedAbsent && parsedAbsent.data.sort_order).toBe(0);

    const blank = parseCategoryForm(
      formData({ ...validFields, sortOrder: "   " }),
    );
    expect("data" in blank && blank.data.sort_order).toBe(0);
  });

  test("truncates a fractional sort order", () => {
    const result = parseCategoryForm(
      formData({ ...validFields, sortOrder: "2.9" }),
    );
    expect("data" in result && result.data.sort_order).toBe(2);
  });

  test("rejects a negative, non-numeric or non-finite sort order", () => {
    for (const value of ["-1", "third", "Infinity"]) {
      expect(
        parseCategoryForm(formData({ ...validFields, sortOrder: value })),
      ).toEqual({ error: "Sort order must be a positive number." });
    }
  });
});

describe("parseCategoryGroupForm", () => {
  const validFields = { label: "  Outerwear  ", sortOrder: "1" };

  test("parses a fully filled form", () => {
    expect(parseCategoryGroupForm(formData(validFields))).toEqual({
      data: { label: "Outerwear", sort_order: 1, is_active: true },
    });
  });

  test("requires a label", () => {
    expect(
      parseCategoryGroupForm(formData({ ...validFields, label: "   " })),
    ).toEqual({ error: "Group name is required." });
  });

  test("defaults an absent sort order to zero", () => {
    const result = parseCategoryGroupForm(formData({ label: "Outerwear" }));
    expect("data" in result && result.data.sort_order).toBe(0);
  });

  test("rejects a negative or non-numeric sort order", () => {
    for (const value of ["-2", "first"]) {
      expect(
        parseCategoryGroupForm(formData({ ...validFields, sortOrder: value })),
      ).toEqual({ error: "Sort order must be a positive number." });
    }
  });

  test("only 'off' turns the active toggle off", () => {
    const off = parseCategoryGroupForm(
      formData({ ...validFields, isActive: "off" }),
    );
    expect("data" in off && off.data.is_active).toBe(false);
  });
});
