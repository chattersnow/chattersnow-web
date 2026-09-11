import { describe, expect, test } from "bun:test";
import { parseProductForm, parseSortOrder } from "./product-form";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseProductForm", () => {
  test("keeps a trimmed name and defaults the rest", () => {
    const result = parseProductForm(form({ name: "  Beanie  " }));
    expect(result).toEqual({
      data: {
        name: "Beanie",
        description: null,
        is_active: true,
        sort_order: 0,
      },
    });
  });

  test("rejects a name that is only whitespace", () => {
    // The column carries `check (btrim(name) <> '')`, so this would be a
    // constraint violation rather than a sentence anyone could act on.
    expect(parseProductForm(form({ name: "   " }))).toEqual({
      error: "Product name is required.",
    });
  });

  test("turns an emptied description into null, not an empty string", () => {
    const result = parseProductForm(form({ name: "Tee", description: "  " }));
    expect(result).toEqual({
      data: { name: "Tee", description: null, is_active: true, sort_order: 0 },
    });
  });

  test("treats only an explicit 'off' as inactive", () => {
    // An unchecked checkbox submits nothing at all, which is why the dialogs
    // post "off" rather than omitting the field.
    expect(
      parseProductForm(form({ name: "Tee", isActive: "off" })),
    ).toMatchObject({ data: { is_active: false } });
    expect(
      parseProductForm(form({ name: "Tee", isActive: "on" })),
    ).toMatchObject({ data: { is_active: true } });
    expect(parseProductForm(form({ name: "Tee" }))).toMatchObject({
      data: { is_active: true },
    });
  });

  test("rejects a negative sort order", () => {
    expect(parseProductForm(form({ name: "Tee", sortOrder: "-1" }))).toEqual({
      error: "Sort order must be a positive number.",
    });
  });
});

describe("parseSortOrder", () => {
  test("absent or blank is 0, not an error", () => {
    expect(parseSortOrder(null)).toBe(0);
    expect(parseSortOrder("  ")).toBe(0);
  });

  test("truncates a fractional order rather than refusing it", () => {
    expect(parseSortOrder("2.7")).toBe(2);
  });

  test("null signals a value that is present and wrong", () => {
    expect(parseSortOrder("-3")).toBeNull();
    expect(parseSortOrder("abc")).toBeNull();
  });
});
