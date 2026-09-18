import { describe, expect, test } from "bun:test";
import {
  categoryLabelFor,
  groupInventoryCategories,
  isRenderableImageSrc,
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

  // #1250 stores a presentational crop as a `#crop=` fragment on the link. The
  // `?id=` capture used to have no `#` in its stop set, so it swallowed the
  // fragment into the file id and stranded `sz=w1000` inside it.
  test("preserves a fragment on the ?id= form instead of corrupting the id", () => {
    expect(
      resolveImageUrl(
        "https://drive.google.com/open?id=ABC#crop=0.1000,0.0000,0.5000,0.5000",
      ),
    ).toBe(
      "https://drive.google.com/thumbnail?id=ABC&sz=w1000#crop=0.1000,0.0000,0.5000,0.5000",
    );
  });

  test("preserves a fragment on the /file/d/ form", () => {
    expect(
      resolveImageUrl(
        "https://drive.google.com/file/d/ABC123/view#crop=0.1000,0.0000,0.5000,0.5000",
      ),
    ).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1000#crop=0.1000,0.0000,0.5000,0.5000",
    );
  });

  test("leaves a fragment on a non-Drive URL where it was", () => {
    const url = "https://example.com/a.png#crop=0.1000,0,0.5,0.5";
    expect(resolveImageUrl(url)).toBe(url);
  });

  // Generic fragment preservation: `resolveImageUrl` knows nothing about crops.
  test("preserves a fragment that is not a crop", () => {
    expect(resolveImageUrl("https://drive.google.com/open?id=ABC#gid=1")).toBe(
      "https://drive.google.com/thumbnail?id=ABC&sz=w1000#gid=1",
    );
  });

  test("stays idempotent over an already-resolved cropped URL", () => {
    const resolved =
      "https://drive.google.com/thumbnail?id=ABC&sz=w1000#crop=0.1000,0.0000,0.5000,0.5000";
    expect(resolveImageUrl(resolved)).toBe(resolved);
  });
});

describe("isRenderableImageSrc", () => {
  test("judges the src a renderer will use, not the fragment", () => {
    expect(
      isRenderableImageSrc("https://example.com/a.png#crop=0.1,0,0.5,0.5"),
    ).toBe(true);
    expect(isRenderableImageSrc("/images/logo.png#crop=0.1,0,0.5,0.5")).toBe(
      true,
    );
    expect(isRenderableImageSrc("not a url#crop=0.1,0,0.5,0.5")).toBe(false);
    expect(isRenderableImageSrc("#crop=0.1,0,0.5,0.5")).toBe(false);
    expect(isRenderableImageSrc(null)).toBe(false);
  });
});
