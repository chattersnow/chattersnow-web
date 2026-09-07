import { describe, expect, test } from "bun:test";
import {
  categoryLabelFor,
  groupInventoryCategories,
  resolveImageUrl,
  type InventoryCategory,
} from "./inventory";

function category(
  key: string,
  label: string,
  groupKey: string,
  groupLabel: string,
): InventoryCategory {
  return { id: key, key, label, groupKey, groupLabel, isActive: true };
}

describe("groupInventoryCategories", () => {
  test("groups consecutive rows and keeps the incoming order", () => {
    const groups = groupInventoryCategories([
      category("snowboard", "Snowboard", "hardgoods", "Hardgoods"),
      category("skis", "Skis", "hardgoods", "Hardgoods"),
      category("jacket", "Jacket", "outerwear", "Outerwear"),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "Hardgoods",
      "Outerwear",
    ]);
    expect(groups[0].categories.map((c) => c.label)).toEqual([
      "Snowboard",
      "Skis",
    ]);
  });

  test("reunites a group whose rows are not adjacent", () => {
    const groups = groupInventoryCategories([
      category("snowboard", "Snowboard", "hardgoods", "Hardgoods"),
      category("jacket", "Jacket", "outerwear", "Outerwear"),
      category("skis", "Skis", "hardgoods", "Hardgoods"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].categories).toHaveLength(2);
  });

  test("returns nothing for an empty vocabulary", () => {
    expect(groupInventoryCategories([])).toEqual([]);
  });
});

describe("categoryLabelFor", () => {
  test("shows the category label", () => {
    expect(
      categoryLabelFor({ category_key: "jacket", category_label: "Jacket" }),
    ).toBe("Jacket");
  });

  test("shows the free-text detail instead of the word Other", () => {
    expect(
      categoryLabelFor({
        category_key: "other",
        category_label: "Other",
        type: "Vintage ski poles",
      }),
    ).toBe("Vintage ski poles");
  });

  test("falls back to the label when Other carries no detail", () => {
    expect(
      categoryLabelFor({ category_key: "other", category_label: "Other" }),
    ).toBe("Other");
  });

  test("falls back to the legacy free text for an uncategorized row", () => {
    expect(categoryLabelFor({ type: "snow board" })).toBe("snow board");
  });

  test("falls back to Uncategorized when there is nothing at all", () => {
    expect(categoryLabelFor({ type: "   " })).toBe("Uncategorized");
    expect(categoryLabelFor({})).toBe("Uncategorized");
  });
});

describe("resolveImageUrl", () => {
  test("rewrites a Drive share link to the thumbnail endpoint", () => {
    expect(resolveImageUrl("https://drive.google.com/file/d/ABC123/view")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1000",
    );
  });

  test("rewrites the ?id= form too", () => {
    expect(resolveImageUrl("https://drive.google.com/open?id=XYZ789")).toBe(
      "https://drive.google.com/thumbnail?id=XYZ789&sz=w1000",
    );
  });

  // The host is matched on the parsed URL rather than as a substring, so a
  // host that merely contains "drive.google.com" in its path is left alone
  // (CodeQL js/incomplete-url-substring-sanitization).
  test("does not treat a lookalike host as Drive", () => {
    const lookalike =
      "https://evil.example/drive.google.com/file/d/ABC123/view";
    expect(resolveImageUrl(lookalike)).toBe(lookalike);
  });

  test("passes root-relative paths through, as site images may be one", () => {
    expect(resolveImageUrl("/images/logo.png")).toBe("/images/logo.png");
  });

  test("passes null and non-Drive hosts through", () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });

  test("returns the URL unchanged when no file id can be found", () => {
    expect(resolveImageUrl("https://drive.google.com/drive/my-drive")).toBe(
      "https://drive.google.com/drive/my-drive",
    );
  });
});
