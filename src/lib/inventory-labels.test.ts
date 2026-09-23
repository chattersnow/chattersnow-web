import { describe, expect, test } from "bun:test";
import {
  LABEL_LAYOUTS,
  MAX_LABEL_ITEMS,
  blankLabelsHref,
  donationLabelsHref,
  parseLabelCodes,
  labelLayoutFor,
  labelsHref,
  labelsPerPage,
  paginateLabels,
  parseLabelOptions,
} from "./inventory-labels";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("LABEL_LAYOUTS", () => {
  test("every layout fits its labels on its page", () => {
    for (const layout of LABEL_LAYOUTS) {
      const width =
        layout.marginLeft +
        layout.columns * layout.label.width +
        (layout.columns - 1) * layout.gapX;
      const height =
        layout.marginTop +
        layout.rows * layout.label.height +
        (layout.rows - 1) * layout.gapY;
      expect(width).toBeLessThanOrEqual(layout.page.width);
      expect(height).toBeLessThanOrEqual(layout.page.height);
    }
  });

  test("the Letter sheets are centred, as the stock is cut", () => {
    for (const layout of LABEL_LAYOUTS.filter((l) => l.key !== "roll")) {
      const used =
        layout.columns * layout.label.width +
        (layout.columns - 1) * layout.gapX;
      expect(layout.page.width - used - layout.marginLeft).toBeCloseTo(
        layout.marginLeft,
      );
    }
  });
});

describe("parseLabelOptions", () => {
  test("keeps uuids in order, once each, and drops anything else", () => {
    const options = parseLabelOptions({
      items: `${B}, ${A.toUpperCase()},not-a-uuid,${B},'; drop table`,
    });
    expect(options.itemIds).toEqual([B, A]);
  });

  test("caps the run", () => {
    const ids = Array.from(
      { length: MAX_LABEL_ITEMS + 5 },
      (_, index) =>
        `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(parseLabelOptions({ items: ids.join(",") }).itemIds).toHaveLength(
      MAX_LABEL_ITEMS,
    );
  });

  test("defaults to the 30-up sheet, no skip, no barcode", () => {
    const options = parseLabelOptions({});
    expect(options.layout.key).toBe("sheet-30");
    expect(options.skip).toBe(0);
    expect(options.barcode).toBe(false);
    expect(options.itemIds).toEqual([]);
  });

  test("an unknown layout falls back to the default", () => {
    expect(parseLabelOptions({ layout: "avery-9999" }).layout.key).toBe(
      "sheet-30",
    );
  });

  test("skip is clamped below a whole sheet, and ignored on a roll", () => {
    expect(parseLabelOptions({ skip: "4" }).skip).toBe(4);
    expect(parseLabelOptions({ skip: "500" }).skip).toBe(29);
    expect(parseLabelOptions({ skip: "-3" }).skip).toBe(0);
    expect(parseLabelOptions({ skip: "abc" }).skip).toBe(0);
    expect(parseLabelOptions({ layout: "roll", skip: "4" }).skip).toBe(0);
  });

  test("barcode is on only for 1", () => {
    expect(parseLabelOptions({ barcode: "1" }).barcode).toBe(true);
    expect(parseLabelOptions({ barcode: "true" }).barcode).toBe(false);
  });
});

describe("paginateLabels", () => {
  const sheet10 = labelLayoutFor("sheet-10");

  test("no labels, no pages", () => {
    expect(paginateLabels([], sheet10)).toEqual([]);
  });

  test("fills the last sheet with blanks", () => {
    const pages = paginateLabels([1, 2, 3], sheet10);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual([1, 2, 3, ...Array(7).fill(null)]);
  });

  test("skipped cells come first and push labels onto a second sheet", () => {
    const pages = paginateLabels(
      Array.from({ length: 10 }, (_, index) => index),
      sheet10,
      3,
    );
    expect(pages).toHaveLength(2);
    expect(pages[0].slice(0, 4)).toEqual([null, null, null, 0]);
    expect(pages[1].slice(0, 3)).toEqual([7, 8, 9]);
    expect(pages.every((page) => page.length === labelsPerPage(sheet10))).toBe(
      true,
    );
  });

  test("a roll prints one label per page", () => {
    expect(paginateLabels(["a", "b"], labelLayoutFor("roll"))).toEqual([
      ["a"],
      ["b"],
    ]);
  });
});

test("labelsHref lists the ids", () => {
  expect(labelsHref([A, B])).toBe(
    `/portal/inventory/items/labels?items=${A},${B}`,
  );
});

describe("intake labels (#1420 part 4)", () => {
  test("parseLabelCodes upper-cases, dedupes and drops anything but a code", () => {
    expect(parseLabelCodes("k7m2qx, K7M2QX,<script>,ab,B8N3RY")).toEqual([
      "K7M2QX",
      "B8N3RY",
    ]);
    expect(parseLabelCodes(undefined)).toEqual([]);
  });

  test("parseLabelCodes caps a run at one print run", () => {
    const many = Array.from({ length: MAX_LABEL_ITEMS + 5 }, (_, i) =>
      `CODE${i}`.padEnd(6, "X"),
    ).join(",");
    expect(parseLabelCodes(many)).toHaveLength(MAX_LABEL_ITEMS);
  });

  test("the intake label hrefs live under Donations", () => {
    expect(donationLabelsHref("d-1")).toBe(
      "/portal/inventory/donations/labels?donation=d-1",
    );
    expect(blankLabelsHref(["K7M2QX", "B8N3RY"])).toBe(
      "/portal/inventory/donations/labels?codes=K7M2QX,B8N3RY",
    );
  });
});
